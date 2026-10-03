import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Difficulty Index v2 (D-063, docs/READING_METRICS.md section 2).
 *
 * Rates one of the caller's books on Bookmarkt's 1-10 Difficulty Index from
 * what is known about the title - the way a well-read librarian would place
 * The Brothers Karamazov far above Dungeon Crawler Carl without opening
 * either. The D-062 metadata prior could not: catalog genres are usually
 * just "Fiction" and the stored year is the edition's, so every novel
 * landed near 5.
 *
 * Walls, in order:
 *   1. authenticated user                       (401)
 *   2. the book must be the caller's (RLS read) (404)
 *   3. cached estimate -> returned, no model    (200, cached: true)
 *   4. per-user daily cap on fresh estimates    (429)
 *   5. Gemini rubric call, validated, persisted (200) / provider failure (502)
 *
 * Only catalog metadata (title, author, year, genre, pages) is sent to the
 * provider - never the reader's notes. No companion entitlement is required:
 * difficulty is a core metric of the free product.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

const GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_DAILY_USER_LIMIT = 60;
const MAX_DAILY_USER_LIMIT = 500;
const MAX_RATIONALE_CHARS = 240;

type Confidence = "high" | "medium" | "low";

type RequestBody = { bookId?: number | string };

type TopicRow = {
  id: number;
  name: string;
  author: string | null;
  publication_year: number | null;
  genre: string | null;
  total_pages: number | null;
  difficulty_estimate: number | null;
  difficulty_estimate_confidence: string | null;
  difficulty_rationale: string | null;
};

function readPositiveLimit(raw: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(maximum, Math.floor(parsed));
}

function extractGeminiText(geminiJson: any): string {
  const parts = geminiJson?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: any) => p?.text ?? "").join("").trim();
}

/** Strip a ```json fence if the model added one despite the JSON mime type. */
function stripFence(text: string): string {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : text;
}

/**
 * The rubric. Anchors are deliberately concrete so the scale means the same
 * thing for every reader; the model places the book between them.
 */
const SYSTEM_PROMPT = `You rate how demanding a book is to read on Bookmarkt's Difficulty Index, a 1-10 scale.
Judge the reading experience of the standard English edition (or English translation): vocabulary and sentence complexity; narrative or structural complexity (nonlinear time, many narrators, digressions, experimental form); conceptual density and background knowledge required; archaic, dialect, or translated prose; and length as a minor stamina factor. Do not judge quality, popularity, or enjoyment.

Anchors:
1 - picture books and early readers (Dr. Seuss, Frog and Toad)
2 - chapter books (Magic Tree House, Diary of a Wimpy Kid)
3 - middle grade, manga, light novels, LitRPG, comic or cozy genre fiction (Percy Jackson, Dungeon Crawler Carl, Harry Potter and the Sorcerer's Stone, Legends & Lattes)
4 - fast commercial fiction and popular self-help (The Hunger Games, Dan Brown, Colleen Hoover, Atomic Habits)
5 - mainstream adult fiction and narrative nonfiction (Stephen King, Project Hail Mary, Educated, Sapiens)
6 - ambitious genre fiction with heavy worldbuilding, or dense popular nonfiction (Dune, The Lord of the Rings, Thinking Fast and Slow, A Brief History of Time)
7 - literary fiction with demanding prose or structure, most 19th-century novels (Beloved, Crime and Punishment, Jane Eyre, Blood Meridian, One Hundred Years of Solitude)
8 - long canonical heavyweights and serious scholarship (Moby-Dick, The Brothers Karamazov 8.5, War and Peace 8.5, Infinite Jest 8.5, The Wealth of Nations)
9 - modernist and philosophical landmarks (Ulysses, Gravity's Rainbow, Being and Time, The Sound and the Fury)
10 - the hardest texts in the language (Finnegans Wake, Critique of Pure Reason, Phenomenology of Spirit)

Respond with JSON only, in this exact shape:
{"difficulty": <number from 1.0 to 10.0 with one decimal>, "confidence": "high" | "medium" | "low", "rationale": "<one sentence under 160 characters naming the concrete reasons>", "known": <true if you recognize this specific book, else false>}

Use "high" when you know the book well, "medium" when you know the author or series but not this title in detail, and "low" when you do not recognize it - then infer from the title, author, catalog genre, year, and length, and say so in the rationale.`;

function buildUserPrompt(topic: TopicRow): string {
  const lines = [`Title: ${topic.name.trim()}`];
  lines.push(`Author: ${topic.author?.trim() || "unknown"}`);
  // The stored year is the edition's publication date (often a reprint),
  // so it is labeled as such rather than as the first publication.
  lines.push(
    `Edition year (may be a reprint, not first publication): ${
      typeof topic.publication_year === "number" ? topic.publication_year : "unknown"
    }`,
  );
  lines.push(`Catalog genre: ${topic.genre?.trim() || "unknown"}`);
  lines.push(
    `Pages in this edition: ${typeof topic.total_pages === "number" ? topic.total_pages : "unknown"}`,
  );
  return lines.join("\n");
}

type Estimate = { difficulty: number; confidence: Confidence; rationale: string; known: boolean };

/** Validate the model's JSON; null when it cannot be trusted. */
function parseEstimate(raw: string): Estimate | null {
  let parsed: any;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    return null;
  }
  const difficulty = Number(parsed?.difficulty);
  if (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 10) {
    return null;
  }
  const confidenceRaw = String(parsed?.confidence ?? "").toLowerCase();
  const confidence: Confidence =
    confidenceRaw === "high" || confidenceRaw === "medium" || confidenceRaw === "low"
      ? (confidenceRaw as Confidence)
      : "low";
  const rationale = String(parsed?.rationale ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_RATIONALE_CHARS);
  return {
    difficulty: Math.round(difficulty * 10) / 10,
    confidence,
    rationale,
    known: parsed?.known === true,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed.", code: "BAD_REQUEST" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !geminiKey) {
    return jsonResponse({ error: "Difficulty service is not configured.", code: "MISCONFIGURED" }, 500);
  }

  const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Authenticated user; every data read/write below runs under their JWT
  // so RLS scopes the rows (D-012).
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) {
    return jsonResponse({ error: "Authentication required. Please sign in again.", code: "UNAUTHORIZED" }, 401);
  }
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return jsonResponse({ error: "Authentication required. Please sign in again.", code: "UNAUTHORIZED" }, 401);
  }
  const userClient: SupabaseClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid request body.", code: "BAD_REQUEST" }, 400);
  }
  const bookId = Number(body?.bookId);
  if (!Number.isFinite(bookId) || bookId <= 0) {
    return jsonResponse({ error: "A book is required.", code: "BAD_REQUEST" }, 400);
  }

  try {
    // 2. The caller's book, read inside their RLS boundary.
    const { data: topic, error: topicError } = await userClient
      .from("topics")
      .select(
        "id, name, author, publication_year, genre, total_pages, difficulty_estimate, difficulty_estimate_confidence, difficulty_rationale",
      )
      .eq("id", bookId)
      .maybeSingle();
    if (topicError) {
      return jsonResponse({ error: "The book could not be loaded. Please try again.", code: "CONTEXT_UNAVAILABLE" }, 503);
    }
    if (!topic) {
      return jsonResponse({ error: "That book was not found.", code: "NOT_FOUND" }, 404);
    }
    const row = topic as TopicRow;

    // 3. Cached: the estimate is stable per book, so one model call ever.
    if (typeof row.difficulty_estimate === "number") {
      return jsonResponse({
        difficulty: row.difficulty_estimate,
        confidence: row.difficulty_estimate_confidence ?? "low",
        rationale: row.difficulty_rationale ?? "",
        cached: true,
      });
    }

    // 4. Daily cap on fresh estimates, counted from the rows written today.
    const dailyLimit = readPositiveLimit(
      Deno.env.get("DIFFICULTY_DAILY_USER_LIMIT"),
      DEFAULT_DAILY_USER_LIMIT,
      MAX_DAILY_USER_LIMIT,
    );
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: usedToday, error: countError } = await userClient
      .from("topics")
      .select("id", { count: "exact", head: true })
      .gte("difficulty_estimated_at", dayStart.toISOString());
    if (countError) {
      return jsonResponse({ error: "The difficulty service is busy. Please try again.", code: "CONTEXT_UNAVAILABLE" }, 503);
    }
    if ((usedToday ?? 0) >= dailyLimit) {
      return jsonResponse(
        { error: "Daily difficulty estimates used up; new books are rated again tomorrow.", code: "RATE_LIMITED" },
        429,
      );
    }

    // 5. The provider call. Temperature 0 and no thinking budget: the task
    // is placement on a fixed rubric, not composition.
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: buildUserPrompt(row) }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 512,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );
    if (!geminiResponse.ok) {
      console.error("book-difficulty provider error", geminiResponse.status, (await geminiResponse.text()).slice(0, 300));
      return jsonResponse({ error: "The difficulty could not be estimated just now.", code: "PROVIDER_ERROR" }, 502);
    }
    const estimate = parseEstimate(extractGeminiText(await geminiResponse.json()));
    if (!estimate) {
      return jsonResponse({ error: "The difficulty could not be estimated just now.", code: "PROVIDER_ERROR" }, 502);
    }
    // An unrecognized book is a low-confidence estimate however sure the
    // model sounds; the UI invites the reader to correct it.
    const confidence: Confidence = estimate.known ? estimate.confidence : "low";

    const { error: updateError } = await userClient
      .from("topics")
      .update({
        difficulty_estimate: estimate.difficulty,
        difficulty_estimate_confidence: confidence,
        difficulty_rationale: estimate.rationale || null,
        difficulty_estimated_at: new Date().toISOString(),
      })
      .eq("id", bookId);
    if (updateError) {
      console.error("book-difficulty persist failed", updateError.message);
      return jsonResponse({ error: "The estimate could not be saved. Please try again.", code: "PERSIST_FAILED" }, 503);
    }

    return jsonResponse({
      difficulty: estimate.difficulty,
      confidence,
      rationale: estimate.rationale,
      cached: false,
    });
  } catch (error) {
    console.error("book-difficulty unexpected failure", error);
    return jsonResponse({ error: "The difficulty could not be estimated just now.", code: "INTERNAL" }, 500);
  }
});
