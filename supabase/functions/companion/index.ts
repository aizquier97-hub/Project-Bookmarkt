import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * AI Reading Companion gatekeeper (Stage 4 Phase 1, STAGE_4_BUILD_PLAN.md).
 *
 * Every request walks the same wall, in order:
 *   1. authenticated user            (401 otherwise)
 *   2. server-authoritative          (402 + subscription offer; audited as
 *      companion entitlement          'denied'; consumes nothing)
 *   3. per-feature daily quota       (429; audited as 'rate_limited';
 *                                     no provider call)
 *   4. context assembly under the    (the user's JWT client - RLS scopes
 *      user's own security boundary   every row; D-012)
 *   5. Gemini call + audit           (tokens, latency, grounding counts -
 *                                     never entry content)
 *
 * The companion persona is the mascot dialogue layer (D-038): a fixed
 * rule-set (calm, non-judgmental, deadpan-scholarly) flavored by the
 * reader's intellectual-archetype profile derived from logged genres.
 * The latest entry is the spoiler boundary (D-012); the reader's notes
 * always win over model knowledge (the notes-mirror stance, D-039).
 */

type Feature =
  | "dialogue"
  | "recap"
  | "cue_cards"
  | "quiz"
  | "club_prep"
  | "word_bank"
  | "structure_aid"
  | "suggest_flags"
  | "semantic_search"
  | "entry_summaries"
  | "observations"
  | "observation_open";

const FEATURES: Feature[] = [
  "dialogue",
  "recap",
  "cue_cards",
  "quiz",
  "club_prep",
  "word_bank",
  "structure_aid",
  "suggest_flags",
  "semantic_search",
  "entry_summaries",
  "observations",
  "observation_open",
];

/**
 * Tools that persist their result as a companion message (revisitable).
 * cue_cards left this list in Interface v2.0 (D-055): the deck renders in
 * its own flip-card screen instead of the conversation.
 */
const PERSISTED_TOOL_FEATURES: Feature[] = ["quiz", "club_prep", "word_bank"];

type RequestBody = {
  feature?: Feature;
  bookId?: number | string;
  message?: string;
  detail?: "brief" | "standard" | "detailed" | string;
  auditId?: string;
  /** Gold-bookmark range summary (D-055): summarize entries between these ids. */
  startEntryId?: number | string;
  endEntryId?: number | string;
  /** Club snapshot (D-055): only entries logged between these ISO dates. */
  rangeStart?: string;
  rangeEnd?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const GEMINI_MODEL = "gemini-2.5-flash";
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMS = 768;
const MAX_SEARCH_ENTRIES = 400;
const SEARCH_MATCH_COUNT = 8;
const SEARCH_MIN_SIMILARITY = 0.25;
const MAX_MESSAGE_CHARS = 2000;
const MAX_CONTEXT_ENTRIES = 60;
const MAX_CONTEXT_CHARS = 24000;
const MAX_CONTEXT_CHARACTERS = 40;
const HISTORY_MESSAGES = 12;
/** Bookmark-ribbon summaries refreshed per entry_summaries call (D-055). */
const MAX_SUMMARY_BATCH = 40;

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function readPositiveLimit(raw: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(maximum, Math.floor(parsed));
}

function truncate(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength) || null;
}

/** Ported from app/src/domains/entries/progress.ts so boundaries parse identically. */
function parseBoundary(text: string | null | undefined): { type: string; upper: number } | null {
  const firstLine = String(text ?? "").split("\n")[0] ?? "";
  const match = firstLine.match(/\b(page|chapter)\s+(\d+)(?:\s*-\s*(\d+))?\b/i);
  if (!match) return null;
  const type = match[1].toLowerCase() === "chapter" ? "chapter" : "page";
  const first = Number(match[2]);
  const second = match[3] ? Number(match[3]) : null;
  if (!Number.isFinite(first) || first <= 0) return null;
  if (second !== null && Number.isFinite(second) && second > 0) {
    return { type, upper: Math.max(first, second) };
  }
  return { type, upper: first };
}

/** Intellectual-archetype profile (D-038) from the reader's logged genres. */
const ARCHETYPES: { key: string; name: string; patterns: RegExp; flavor: string }[] = [
  {
    key: "analyst",
    name: "Analyst",
    patterns: /mystery|thriller|crime|detective|suspense|espionage|horror|noir/i,
    flavor:
      "lean analytical: notice structure, motives, unresolved threads, and quietly relish a good deduction",
  },
  {
    key: "empath",
    name: "Empath",
    patterns: /romance|drama|young adult|contemporary|relationship|family|memoir|poetry|coming.of.age/i,
    flavor:
      "lean empathic: attend to characters' inner lives, relationships, and what the reader felt",
  },
  {
    key: "philosopher",
    name: "Philosopher",
    patterns: /philosophy|history|nonfiction|non-fiction|science(?!\s*fiction)|psychology|self-help|religion|classic|essay|biography|politics|business|econom/i,
    flavor:
      "lean philosophical: draw out ideas, themes, and questions worth sitting with",
  },
  {
    key: "worldbuilder",
    name: "World-Builder",
    patterns: /fantasy|science fiction|sci-fi|speculative|epic|dystop|adventure|myth|fairy|supernatural|light novel|gaming|litrpg/i,
    flavor:
      "lean world-building: delight in worlds, systems, lore, and how the pieces fit together",
  },
];

function archetypeFlavor(genres: (string | null)[]): string {
  const counts = new Map<string, number>();
  for (const genre of genres) {
    if (!genre) continue;
    for (const archetype of ARCHETYPES) {
      if (archetype.patterns.test(genre)) {
        counts.set(archetype.key, (counts.get(archetype.key) ?? 0) + 1);
      }
    }
  }
  if (counts.size === 0) {
    return "You have no genre signal yet; be the even-handed scholar, curious about everything.";
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((sum, [, n]) => sum + n, 0);
  const [topKey, topCount] = ranked[0];
  const top = ARCHETYPES.find((a) => a.key === topKey)!;
  if (ranked.length > 1 && topCount / total < 0.6) {
    const second = ARCHETYPES.find((a) => a.key === ranked[1][0])!;
    return `The reader's shelf skews ${top.name} with a ${second.name} streak; ${top.flavor}, with a touch of the ${second.name}'s instincts.`;
  }
  return `The reader's shelf skews ${top.name}; ${top.flavor}.`;
}

/** The fixed mascot rule-set (D-038). The archetype only flavors it. */
function buildSystemPrompt(params: {
  bookTitle: string;
  author: string | null;
  boundaryLabel: string | null;
  flavor: string;
  entriesBlock: string;
  charactersBlock: string;
  entryCount: number;
  /** Dialogue only (D-056): Socratic-mirror contract + perspective stems. */
  socratic?: boolean;
}): string {
  const { bookTitle, author, boundaryLabel, flavor, entriesBlock, charactersBlock, entryCount, socratic } = params;
  const boundaryRule = boundaryLabel
    ? `The reader has read up to ${boundaryLabel} and NOT beyond. You must never reveal, hint at, foreshadow, or ask leading questions about anything in the story after ${boundaryLabel}.`
    : entryCount > 0
      ? "The reader's notes carry no position marker, so treat everything not in the notes as unread: never reveal or hint at any plot event that is not in the notes."
      : "The reader has no notes on this book yet, so you know nothing about their progress: never reveal or hint at any plot event at all. Warmly invite a first note instead.";

  return [
    "You are the Bookmarkt reading companion: a distinguished, scholarly presence with a calm, deadpan wit.",
    "Fixed rules of your character, never broken:",
    "- Calm and non-judgmental. You never scold, grade, or judge the reader's pace, taste, or writing. One-sentence notes are excellent notes.",
    "- Deadpan-scholarly humor: dry, understated, precise. Never zany, never exclamation-heavy, no emoji.",
    "- Socratic first: you prefer a well-placed question over a lecture. Keep replies to a few short paragraphs at most.",
    "- You never write the reader's records for them. You may discuss, question, and arrange - the reader authors every saved word.",
    `Personality flavor for this reader (subtle, never stated aloud): ${flavor}`,
    "",
    `The book under discussion: "${bookTitle}"${author ? ` by ${author}` : ""}.`,
    "",
    "Your knowledge of WHAT HAS HAPPENED comes exclusively from the reader's own notes below. General knowledge about the author, setting, publication context, or the world is permitted.",
    boundaryRule,
    "If the reader asks about anything beyond that boundary, decline visibly, in character, in one short line - and set declined to true.",
    "If the reader's notes contradict your own knowledge of the book, the notes win: mirror the notes, and at most gently wonder aloud.",
    "",
    entryCount > 0 ? `THE READER'S NOTES (oldest first, ${entryCount} total):` : "THE READER'S NOTES: none yet.",
    entriesBlock,
    charactersBlock ? `\nTHE READER'S CHARACTER MAP:\n${charactersBlock}` : "",
    "",
    ...(socratic
      ? [
          "THE SOCRATIC MIRROR (your strict conversational contract, D-056):",
          "- You are a mirror, not a lecturer. You never generate unearned insights, never summarize plot the reader has not logged, and never explain the book at them.",
          "- Shape every reply as: VALIDATE in one sentence (mirror what the reader just said, using their own premises and words), then PROBE in one sentence (one open-ended question that pushes their thought further, grounded in their notes).",
          "- At most one extra sentence when strictly needed (e.g. a boundary decline). Never answer your own question.",
          "- With each reply, offer 2-3 short answer stems the reader could start their response with: first-person or claim fragments of 3-6 words in the reader's register (e.g. \"They were afraid\", \"It was strategic\"). Never full sentences, never questions.",
          "",
          'Respond ONLY with JSON: {"reply": string, "provenance": "your_notes" | "general_knowledge" | "mixed", "declined": boolean, "stems": [string]}.',
          'provenance is "your_notes" when the reply rests on the notes, "general_knowledge" when it rests on outside knowledge, "mixed" when both.',
        ]
      : [
          'Respond ONLY with JSON: {"reply": string, "provenance": "your_notes" | "general_knowledge" | "mixed", "declined": boolean}.',
          'provenance is "your_notes" when the reply rests on the notes, "general_knowledge" when it rests on outside knowledge, "mixed" when both.',
        ]),
  ].join("\n");
}

function buildRecapPrompt(detail: string, entryCount: number, rangeLabel: string | null): string {
  const shape =
    detail === "detailed"
      ? "Write a fuller recap: 2-4 short paragraphs, or headed sections if the notes span many sittings."
      : detail === "standard"
        ? "Write a recap of 1-2 short paragraphs: the story's thread with its key turns."
        : "Write a brief recap: 3-5 sentences.";
  const opening = rangeLabel
    ? `The reader chose a specific stretch of their notes (${rangeLabel}) and asks for the story of that stretch. Retell it USING ONLY the ${entryCount} notes above - their events, their names, their words where natural.`
    : `The reader is returning to the book and asks: where did I leave off? Retell the story so far USING ONLY the ${entryCount} notes above - their events, their names, their words where natural.`;
  return [
    opening,
    shape,
    "Never add events the notes do not contain, and never go past the boundary. End with the exact position if known (e.g. \"You're at page 124.\").",
    'Respond ONLY with JSON: {"reply": string, "provenance": "your_notes", "declined": false}.',
  ].join("\n");
}

const REPLY_JSON_RULE =
  'Respond ONLY with JSON: {"reply": string, "provenance": "your_notes" | "general_knowledge" | "mixed", "declined": boolean}.';

/** Single-turn prompts for the companion tools (D-039 premium feature set). */
function buildToolPrompt(
  feature: Feature,
  opts: {
    entryCount: number;
    characterCount: number;
    detail: string;
    message: string;
    genre: string | null;
    rangeLabel: string | null;
  },
): string {
  switch (feature) {
    case "cue_cards":
      return [
        `The reader asks for recall cue cards drawn from their ${opts.entryCount} notes and their character map above. The cards activate active retrieval: the reader teaches the book back to themselves.`,
        "Create 5-8 cards. Each card has a front and a back:",
        "- front: an extremely short recall cue - a question or prompt of AT MOST 10 words, rooted in the reader's own entries or characters.",
        "- back: the answer in AT MOST 20 words, taken from the notes or character map, in the reader's own terms.",
        "Cards must be terse, never word-dense. Only material from the notes and character map; nothing past the boundary; never invent.",
        "reply is one short deadpan line introducing the deck.",
        'Respond ONLY with JSON: {"reply": string, "provenance": "your_notes", "declined": false, "cards": [{"front": string, "back": string}]}.',
      ].join("\n");
    case "quiz":
      return [
        `The reader asks to be quizzed on the characters in their character map (${opts.characterCount} mapped).`,
        "Write exactly 3 short quiz questions grounded in the reader's character map and notes - who they are, what they did, how they connect.",
        "Number the questions. Do NOT include the answers: invite the reader to answer in the chat, and you will confirm from their notes.",
        "Nothing past the boundary.",
        REPLY_JSON_RULE,
      ].join("\n");
    case "club_prep":
      if (opts.rangeLabel) {
        return [
          `The reader heads to book club and asks for a snapshot of everything they logged ${opts.rangeLabel} - the read-it-on-the-way summary. Their ${opts.entryCount} notes from that window are above.`,
          "Prepare, in this order, with headed sections:",
          "'Your snapshot' - retell what happened in those notes as 1-3 flowing short paragraphs, smooth enough to read in one pass, using the reader's own events and names.",
          "'Questions to bring' - 3-4 discussion questions, each traceable to something in those notes.",
          "Nothing past the boundary; never invent events.",
          REPLY_JSON_RULE,
        ].join("\n");
      }
      return [
        `The reader is preparing for a book-club discussion using their ${opts.entryCount} notes above.`,
        "Prepare: (1) 4-5 discussion questions the reader could bring, each traceable to something in their notes; (2) 2-3 short talking points in the reader's own observations, phrased for them to voice.",
        "Use headed sections 'Questions to bring' and 'Your talking points'. Nothing past the boundary; never invent events.",
        REPLY_JSON_RULE,
      ].join("\n");
    case "word_bank": {
      const level =
        opts.detail === "simple"
          ? "simple: everyday words a step above common speech"
          : opts.detail === "scholarly"
            ? "scholarly: rare, precise, literary words"
            : "standard: solid vocabulary an engaged reader collects";
      return [
        `The reader asks for a word bank fitted to this book${opts.genre ? ` (genre: ${opts.genre})` : ""} at their chosen level (${level}).`,
        "Assemble 6-8 words that suit the book's register and world. For each, a numbered line: the word in bold-less plain text, an em-dash, a one-line definition, then ' - e.g. ' and one context sentence tied to the book's setting or themes WITHOUT revealing any plot past the boundary.",
        "General vocabulary knowledge is permitted here (provenance general_knowledge or mixed).",
        REPLY_JSON_RULE,
      ].join("\n");
    }
    case "structure_aid":
      return [
        "The reader drafted a note and asks for help arranging it. Their draft, verbatim:",
        `"""${opts.message}"""`,
        "Suggest a tidier arrangement USING THE READER'S OWN WORDS wherever possible - reorder, group, and trim, with only minimal connective tissue. Never add events, opinions, or details the draft does not contain.",
        "Shape: short lines or bullets (what happened / who was involved / where they are), only as far as the draft supports.",
        "Close with one dry line reminding them the note is theirs to edit before saving.",
        REPLY_JSON_RULE,
      ].join("\n");
    case "suggest_flags":
      return [
        `The reader asks which of their notes read like pivotal moments worth flagging. Their notes above are numbered with [#id] markers.`,
        "Choose up to 3 notes that record turning points: deaths, reveals, arrivals, decisions, reversals. Judge only from the notes.",
        'Respond ONLY with JSON: {"reply": string, "provenance": "your_notes", "declined": false, "suggestions": [{"entryId": number, "reason": string}]}.',
        "reply is one short deadpan line introducing the suggestions. Each reason is one line naming why that note looks pivotal, in the reader's terms. If nothing qualifies, return an empty suggestions array and say so plainly.",
      ].join("\n");
    case "observations":
      return [
        `The reader has opened the Book Club and said nothing yet. From their ${opts.entryCount} notes and character map above, prepare 1-3 observation cards: specific, grounded conversation openers that spare them a blank page.`,
        "Each card is ONE open-ended question (at most 35 words) rooted in something concrete the reader actually wrote - a contradiction between two of their notes, a pattern or repeated theme across notes, or a shift in how they describe a character.",
        "Point at their own material (\"You noted...\", \"You've mentioned... twice\") - never at plot they did not log, never past the boundary, never generic book-club filler.",
        "If the notes are too thin for a grounded question, return fewer cards rather than inventing.",
        "reply is one short deadpan line (it is not shown prominently).",
        'Respond ONLY with JSON: {"reply": string, "provenance": "your_notes", "declined": false, "observations": [{"prompt": string}]}.',
      ].join("\n");
    default:
      return REPLY_JSON_RULE;
  }
}

function extractGeminiText(geminiJson: any): string {
  const parts = geminiJson?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: any) => p?.text ?? "").join("").trim();
}

/** djb2 - cheap change detection for re-embedding edited entries. */
function hashContent(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `djb2:${(hash >>> 0).toString(16)}:${text.length}`;
}

/** Re-normalize: sub-3072-dim Gemini embeddings are not unit vectors. */
function normalizeVector(values: number[]): number[] {
  let sumSquares = 0;
  for (const v of values) sumSquares += v * v;
  const norm = Math.sqrt(sumSquares);
  if (!Number.isFinite(norm) || norm === 0) return values;
  return values.map((v) => v / norm);
}

/** Batch-embed texts (documents or the query) at EMBEDDING_DIMS, normalized. */
async function embedTexts(
  geminiKey: string,
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[][]> {
  const out: number[][] = [];
  const BATCH = 100;
  for (let start = 0; start < texts.length; start += BATCH) {
    const chunk = texts.slice(start, start + BATCH);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: chunk.map((text) => ({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text: text.slice(0, 8000) }] },
            taskType,
            outputDimensionality: EMBEDDING_DIMS,
          })),
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`embedding upstream ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const json = await response.json();
    const embeddings = Array.isArray(json?.embeddings) ? json.embeddings : [];
    if (embeddings.length !== chunk.length) {
      throw new Error("embedding upstream returned a mismatched batch");
    }
    for (const item of embeddings) {
      const values = Array.isArray(item?.values) ? item.values.map(Number) : [];
      if (values.length !== EMBEDDING_DIMS) {
        throw new Error("embedding upstream returned wrong dimensionality");
      }
      out.push(normalizeVector(values));
    }
  }
  return out;
}

/**
 * One batched call summarizes every stale note into a bookmark-ribbon label
 * (D-055). Each summary is grounded in its own note alone.
 */
function buildEntrySummariesPrompt(notes: { id: number; text: string }[]): string {
  return [
    "The reader's app shows each of their reading notes as a slim bookmark, labeled with a one-line summary. Summarize each note below.",
    "Rules for every summary:",
    "- AT MOST 10 words. A fragment is fine; no trailing period needed.",
    "- Use only that note's own content and, where natural, the reader's own words. Never add events, names, or judgments.",
    "- Plain and factual: what the note records, not commentary about the note.",
    "The notes, each marked with its id:",
    ...notes.map((n) => `[#${n.id}] ${n.text.replace(/\n+/g, " / ").slice(0, 1200)}`),
    'Respond ONLY with JSON: {"summaries": [{"entryId": number, "summary": string}]} - one item per note above.',
  ].join("\n");
}

function parseCompanionJson(raw: string): {
  reply: string;
  provenance: string;
  declined: boolean;
  suggestions: { entryId: number; reason: string }[];
  cards: { front: string; back: string }[];
  stems: string[];
  observations: { prompt: string }[];
} {
  try {
    const parsed = JSON.parse(raw);
    const reply = String(parsed?.reply ?? "").trim();
    if (reply) {
      const provenance = ["your_notes", "general_knowledge", "mixed"].includes(parsed?.provenance)
        ? parsed.provenance
        : "mixed";
      const suggestions = Array.isArray(parsed?.suggestions)
        ? parsed.suggestions
            .map((s: any) => ({
              entryId: Number(s?.entryId),
              reason: String(s?.reason ?? "").trim().slice(0, 300),
            }))
            .filter((s: { entryId: number }) => Number.isFinite(s.entryId) && s.entryId > 0)
            .slice(0, 3)
        : [];
      const cards = Array.isArray(parsed?.cards)
        ? parsed.cards
            .map((c: any) => ({
              front: String(c?.front ?? "").trim().slice(0, 200),
              back: String(c?.back ?? "").trim().slice(0, 300),
            }))
            .filter((c: { front: string; back: string }) => c.front && c.back)
            .slice(0, 10)
        : [];
      const stems = Array.isArray(parsed?.stems)
        ? parsed.stems
            .map((s: any) => String(s ?? "").trim().slice(0, 60))
            .filter((s: string) => s.length > 0)
            .slice(0, 3)
        : [];
      const observations = Array.isArray(parsed?.observations)
        ? parsed.observations
            .map((o: any) => ({ prompt: String(o?.prompt ?? "").trim().slice(0, 400) }))
            .filter((o: { prompt: string }) => o.prompt.length > 0)
            .slice(0, 3)
        : [];
      return { reply, provenance, declined: parsed?.declined === true, suggestions, cards, stems, observations };
    }
  } catch {
    // fall through to raw-text fallback
  }
  return { reply: raw.trim(), provenance: "mixed", declined: false, suggestions: [], cards: [], stems: [], observations: [] };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !geminiKey) {
    return jsonResponse({ error: "Companion service is not configured.", code: "MISCONFIGURED" }, 500);
  }

  const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. Authenticated user. The user-scoped client carries the caller's JWT so
  // every data read/write below runs inside their RLS boundary (D-012).
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) {
    return jsonResponse({ error: "Authentication required. Please sign in again.", code: "UNAUTHORIZED" }, 401);
  }
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return jsonResponse({ error: "Authentication required. Please sign in again.", code: "UNAUTHORIZED" }, 401);
  }
  const userClient: SupabaseClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid request body.", code: "BAD_REQUEST" }, 400);
  }

  const feature: Feature = FEATURES.includes(body?.feature as Feature)
    ? (body!.feature as Feature)
    : "dialogue";
  const bookId = Number(body?.bookId);
  if (!Number.isFinite(bookId) || bookId <= 0) {
    return jsonResponse({ error: "A book is required.", code: "BAD_REQUEST" }, 400);
  }
  const message = String(body?.message ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
  if (feature === "dialogue" && !message) {
    return jsonResponse({ error: "Say something to the companion first.", code: "BAD_REQUEST" }, 400);
  }
  if (feature === "structure_aid" && !message) {
    return jsonResponse({ error: "Write a draft first, then ask for help arranging it.", code: "BAD_REQUEST" }, 400);
  }
  if (feature === "semantic_search" && !message) {
    return jsonResponse({ error: "Type what you are looking for first.", code: "BAD_REQUEST" }, 400);
  }
  if (feature === "observation_open" && !message) {
    return jsonResponse({ error: "An observation card is required.", code: "BAD_REQUEST" }, 400);
  }
  const detail =
    feature === "word_bank"
      ? ["simple", "standard", "scholarly"].includes(String(body?.detail))
        ? String(body?.detail)
        : "standard"
      : ["brief", "standard", "detailed"].includes(String(body?.detail))
        ? String(body?.detail)
        : "brief";
  // Gold-bookmark stretch (recap) and club-snapshot window (club_prep), D-055.
  const startEntryId = Number(body?.startEntryId);
  const endEntryId = Number(body?.endEntryId);
  const hasEntryRange =
    feature === "recap" &&
    Number.isFinite(startEntryId) &&
    startEntryId > 0 &&
    Number.isFinite(endEntryId) &&
    endEntryId > 0;
  const rangeStart =
    typeof body?.rangeStart === "string" && !Number.isNaN(Date.parse(body.rangeStart))
      ? body.rangeStart
      : null;
  const rangeEnd =
    typeof body?.rangeEnd === "string" && !Number.isNaN(Date.parse(body.rangeEnd))
      ? body.rangeEnd
      : null;
  const hasDateRange = feature === "club_prep" && rangeStart !== null && rangeEnd !== null;
  const auditId = truncate(body?.auditId, 64) ?? crypto.randomUUID();

  const auditDenied = async (decision: "denied_unentitled", httpStatus: number) => {
    try {
      await admin.from("companion_usage_events").insert({
        user_id: userId,
        audit_id: auditId,
        feature,
        status: "denied",
        entitlement_decision: decision,
        topic_id: bookId,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        http_status: httpStatus,
      });
    } catch (auditError) {
      console.error("companion denied-audit insert failed", auditError);
    }
  };

  try {
    // 2. Server-authoritative entitlement. No entitlement -> no retrieval,
    // no quota, no provider - just the offer (roadmap section 13).
    const { data: entitlementRow, error: entitlementError } = await admin
      .from("companion_entitlements")
      .select("status, trial_expires_at, current_period_end")
      .eq("user_id", userId)
      .maybeSingle();
    if (entitlementError) {
      return jsonResponse({ error: "Companion access could not be verified. Please try again.", code: "ENTITLEMENT_UNAVAILABLE" }, 503);
    }
    const now = Date.now();
    const status = entitlementRow?.status ?? "none";
    const trialLive =
      status === "trial" &&
      !!entitlementRow?.trial_expires_at &&
      new Date(entitlementRow.trial_expires_at).getTime() > now;
    const entitled = status === "comped" || status === "active" || trialLive;
    if (!entitled) {
      await auditDenied("denied_unentitled", 402);
      return jsonResponse(
        {
          error: "The reading companion is part of the Bookmarkt subscription.",
          code: "COMPANION_SUBSCRIPTION_REQUIRED",
          offer: true,
        },
        402,
      );
    }

    // 3. Per-feature daily quota (cost control). Denials consume nothing.
    const TOOL_LIMITS: Partial<Record<Feature, { env: string; fallback: number; max: number }>> = {
      dialogue: { env: "COMPANION_DIALOGUE_DAILY_LIMIT", fallback: 50, max: 1000 },
      recap: { env: "COMPANION_RECAP_DAILY_LIMIT", fallback: 10, max: 200 },
      cue_cards: { env: "COMPANION_TOOL_DAILY_LIMIT", fallback: 10, max: 200 },
      quiz: { env: "COMPANION_TOOL_DAILY_LIMIT", fallback: 10, max: 200 },
      club_prep: { env: "COMPANION_TOOL_DAILY_LIMIT", fallback: 10, max: 200 },
      word_bank: { env: "COMPANION_TOOL_DAILY_LIMIT", fallback: 10, max: 200 },
      structure_aid: { env: "COMPANION_STRUCTURE_AID_DAILY_LIMIT", fallback: 20, max: 500 },
      suggest_flags: { env: "COMPANION_TOOL_DAILY_LIMIT", fallback: 10, max: 200 },
      semantic_search: { env: "COMPANION_SEARCH_DAILY_LIMIT", fallback: 20, max: 500 },
      entry_summaries: { env: "COMPANION_SUMMARY_DAILY_LIMIT", fallback: 30, max: 500 },
      observations: { env: "COMPANION_OBSERVATIONS_DAILY_LIMIT", fallback: 20, max: 500 },
      observation_open: { env: "COMPANION_DIALOGUE_DAILY_LIMIT", fallback: 50, max: 1000 },
    };
    const limitSpec = TOOL_LIMITS[feature] ?? TOOL_LIMITS.dialogue!;
    const userDailyLimit = readPositiveLimit(
      Deno.env.get(limitSpec.env),
      limitSpec.fallback,
      limitSpec.max,
    );
    const projectDailyLimit = readPositiveLimit(
      Deno.env.get("COMPANION_DAILY_PROJECT_LIMIT"),
      1000,
      100000,
    );
    const { data: quotaData, error: quotaError } = await admin.rpc("consume_companion_quota", {
      p_user_id: userId,
      p_feature: feature,
      p_audit_id: auditId,
      p_topic_id: bookId,
      p_user_daily_limit: userDailyLimit,
      p_project_daily_limit: projectDailyLimit,
    });
    if (quotaError) {
      return jsonResponse({ error: "Companion usage protection is temporarily unavailable. Please try again shortly.", code: "QUOTA_UNAVAILABLE" }, 503);
    }
    const quotaRow = Array.isArray(quotaData) ? quotaData[0] : quotaData;
    if (!quotaRow?.event_id) {
      return jsonResponse({ error: "Companion usage protection returned an invalid response.", code: "QUOTA_UNAVAILABLE" }, 503);
    }
    const quota = {
      used: Number(quotaRow.user_used ?? 0),
      remaining: Number(quotaRow.user_remaining ?? 0),
      limit: Number(quotaRow.user_limit ?? userDailyLimit),
      resetAt: quotaRow.reset_at,
    };
    if (quotaRow.allowed !== true) {
      const projectScope = String(quotaRow.quota_scope ?? "user") === "project";
      return jsonResponse(
        {
          error: projectScope
            ? "The companion has reached its capacity for today. It will return after the daily reset."
            : "You've reached today's companion limit for this feature. It resets tomorrow.",
          code: projectScope ? "COMPANION_PROJECT_DAILY_LIMIT_EXCEEDED" : "COMPANION_DAILY_LIMIT_EXCEEDED",
          quota,
        },
        429,
      );
    }
    const usageEventId = Number(quotaRow.event_id);

    const finalize = async (
      outcome: "succeeded" | "failed",
      httpStatus: number,
      extras: Record<string, unknown> = {},
    ) => {
      try {
        await admin
          .from("companion_usage_events")
          .update({
            status: outcome,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            http_status: httpStatus,
            model: GEMINI_MODEL,
            ...extras,
          })
          .eq("id", usageEventId);
      } catch (finalizeError) {
        console.error("companion usage finalize failed", finalizeError);
      }
    };

    // 4. Context assembly under the user's own JWT: RLS scopes every row to
    // the caller, and the book lookup doubles as the ownership check.
    const [bookResult, entriesResult, charactersResult, genresResult] = await Promise.all([
      userClient.from("topics").select("id, name, author, total_pages, genre").eq("id", bookId).maybeSingle(),
      userClient
        .from("entries")
        .select("id, text, created_at")
        .eq("topic_id", bookId)
        .order("created_at", { ascending: false })
        .limit(MAX_CONTEXT_ENTRIES),
      userClient
        .from("characters")
        .select("id, name, description")
        .eq("topic_id", bookId)
        .order("name", { ascending: true })
        .limit(MAX_CONTEXT_CHARACTERS),
      userClient.from("topics").select("genre").not("genre", "is", null),
    ]);
    if (bookResult.error || entriesResult.error || charactersResult.error) {
      await finalize("failed", 503, { error_code: "CONTEXT_UNAVAILABLE" });
      return jsonResponse({ error: "Your notes could not be loaded. Please try again.", code: "CONTEXT_UNAVAILABLE" }, 503);
    }
    const book = bookResult.data;
    if (!book) {
      await finalize("failed", 404, { error_code: "BOOK_NOT_FOUND" });
      return jsonResponse({ error: "That book is not on your shelf.", code: "BOOK_NOT_FOUND" }, 404);
    }

    const newestFirst = entriesResult.data ?? [];
    const boundary = newestFirst.map((e) => parseBoundary(e.text)).find(Boolean) ?? null;
    const boundaryLabel = boundary ? `${boundary.type} ${boundary.upper}` : null;
    const oldestFirst = [...newestFirst].reverse();

    // observation_open (D-056): the reader tapped an observation card. Persist
    // it as a companion-authored message so the Socratic thread starts from it.
    // No model call - the card text was already generated by 'observations'.
    if (feature === "observation_open") {
      const { data: cardRow, error: cardError } = await userClient
        .from("companion_messages")
        .insert({
          user_id: userId,
          topic_id: bookId,
          role: "companion",
          feature: "observation",
          content: message.slice(0, 600),
          provenance: {
            sources: "your_notes",
            declined: false,
            boundaryLabel,
            entryCount: newestFirst.length,
          },
        })
        .select("id, role, feature, content, provenance, created_at")
        .single();
      if (cardError) {
        await finalize("failed", 503, { error_code: "PERSIST_FAILED", error_message: truncate(cardError.message, 300) });
        return jsonResponse({ error: "The conversation could not be saved. Please try again.", code: "PERSIST_FAILED" }, 503);
      }
      await finalize("succeeded", 200, { grounding_entries: newestFirst.length, grounding_characters: 0 });
      return jsonResponse({
        reply: { content: message.slice(0, 600), provenance: "your_notes", declined: false },
        boundaryLabel,
        quota,
        messages: [cardRow],
      });
    }

    if (feature === "recap" && oldestFirst.length === 0) {
      await finalize("succeeded", 200, { grounding_entries: 0, grounding_characters: 0 });
      return jsonResponse({
        code: "NO_ENTRIES",
        reply: {
          content:
            "There is nothing to retell yet - your notes on this book are still a blank page. Save a first note and I shall keep the thread from there.",
          provenance: "your_notes",
          declined: false,
        },
        boundaryLabel: null,
        quota,
      });
    }
    const needsEntries: Feature[] = ["cue_cards", "club_prep", "suggest_flags", "observations"];
    if (needsEntries.includes(feature) && oldestFirst.length === 0) {
      await finalize("succeeded", 200, { grounding_entries: 0, grounding_characters: 0 });
      return jsonResponse({
        code: "NO_ENTRIES",
        reply: {
          content:
            "I work only from your own notes, and there are none on this book yet. Save a note or two and this will have something to stand on.",
          provenance: "your_notes",
          declined: false,
        },
        boundaryLabel: null,
        quota,
        suggestions: [],
        ...(feature === "observations" ? { observations: [] } : {}),
      });
    }
    if (feature === "quiz" && (charactersResult.data ?? []).length === 0) {
      await finalize("succeeded", 200, { grounding_entries: oldestFirst.length, grounding_characters: 0 });
      return jsonResponse({
        code: "NO_CHARACTERS",
        reply: {
          content:
            "Your character map for this book is empty, so a character quiz would be an exercise in silence. Add a character or two first.",
          provenance: "your_notes",
          declined: false,
        },
        boundaryLabel: null,
        quota,
      });
    }

    // Bookmark-ribbon summaries (D-055): one batched call refreshes the
    // one-line summary on every entry whose text changed since last time.
    // Results land on the entry rows (under the user's JWT/RLS); nothing is
    // persisted to the conversation.
    if (feature === "entry_summaries") {
      const { data: summaryRows, error: summaryFetchError } = await userClient
        .from("entries")
        .select("id, text, ai_summary, ai_summary_hash")
        .eq("topic_id", bookId)
        .order("created_at", { ascending: false })
        .limit(MAX_SEARCH_ENTRIES);
      if (summaryFetchError) {
        await finalize("failed", 503, { error_code: "CONTEXT_UNAVAILABLE" });
        return jsonResponse({ error: "Your notes could not be loaded. Please try again.", code: "CONTEXT_UNAVAILABLE" }, 503);
      }
      const stale = (summaryRows ?? [])
        .filter((r) => String(r.text ?? "").trim())
        .filter((r) => !r.ai_summary || r.ai_summary_hash !== hashContent(String(r.text)))
        .slice(0, MAX_SUMMARY_BATCH);
      if (stale.length === 0) {
        await finalize("succeeded", 200, { grounding_entries: 0 });
        return jsonResponse({
          reply: { content: "", provenance: "your_notes", declined: false },
          boundaryLabel,
          quota,
          summaries: [],
        });
      }
      const summariesResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: buildEntrySummariesPrompt(
                      stale.map((r) => ({ id: Number(r.id), text: String(r.text) })),
                    ),
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
            },
          }),
        },
      );
      if (!summariesResponse.ok) {
        await finalize("failed", 502, {
          upstream_status: summariesResponse.status,
          error_code: "PROVIDER_ERROR",
          error_message: truncate(await summariesResponse.text(), 300),
        });
        return jsonResponse({ error: "The summaries could not be written just now.", code: "PROVIDER_ERROR" }, 502);
      }
      const summariesJson = await summariesResponse.json();
      let parsedSummaries: { entryId: number; summary: string }[] = [];
      try {
        const raw = JSON.parse(extractGeminiText(summariesJson));
        const staleById = new Map(stale.map((r) => [Number(r.id), String(r.text)]));
        parsedSummaries = (Array.isArray(raw?.summaries) ? raw.summaries : [])
          .map((s: any) => ({
            entryId: Number(s?.entryId),
            summary: String(s?.summary ?? "").trim().slice(0, 140),
          }))
          .filter(
            (s: { entryId: number; summary: string }) =>
              s.summary && staleById.has(s.entryId),
          );
      } catch {
        parsedSummaries = [];
      }
      const staleTextById = new Map(stale.map((r) => [Number(r.id), String(r.text)]));
      await Promise.all(
        parsedSummaries.map(async (s) => {
          const { error: writeError } = await userClient
            .from("entries")
            .update({
              ai_summary: s.summary,
              ai_summary_hash: hashContent(staleTextById.get(s.entryId) ?? ""),
            })
            .eq("id", s.entryId)
            .eq("topic_id", bookId);
          if (writeError) {
            console.error("entry summary write failed", s.entryId, writeError.message);
          }
        }),
      );
      const summaryUsage = summariesJson?.usageMetadata ?? {};
      await finalize("succeeded", 200, {
        grounding_entries: stale.length,
        prompt_tokens: Number(summaryUsage.promptTokenCount ?? 0) || null,
        output_tokens: Number(summaryUsage.candidatesTokenCount ?? 0) || null,
      });
      return jsonResponse({
        reply: { content: "", provenance: "your_notes", declined: false },
        boundaryLabel,
        quota,
        summaries: parsedSummaries,
      });
    }

    // Semantic search: bring embeddings up to date, match, return entry ids.
    // No generative call and nothing persisted beyond the embeddings, which
    // are numerical signatures scoped by RLS like the entries themselves.
    if (feature === "semantic_search") {
      const { data: searchRows, error: searchError } = await userClient
        .from("entries")
        .select("id, text")
        .eq("topic_id", bookId)
        .order("created_at", { ascending: false })
        .limit(MAX_SEARCH_ENTRIES);
      if (searchError) {
        await finalize("failed", 503, { error_code: "CONTEXT_UNAVAILABLE" });
        return jsonResponse({ error: "Your notes could not be loaded. Please try again.", code: "CONTEXT_UNAVAILABLE" }, 503);
      }
      const rows = (searchRows ?? []).filter((r) => String(r.text ?? "").trim());
      if (rows.length === 0) {
        await finalize("succeeded", 200, { grounding_entries: 0, model: EMBEDDING_MODEL });
        return jsonResponse({
          code: "NO_ENTRIES",
          reply: {
            content: "There are no notes to search yet - save a few first.",
            provenance: "your_notes",
            declined: false,
          },
          boundaryLabel: null,
          quota,
          results: [],
        });
      }
      try {
        // Re-embed only entries whose text changed since last time.
        const { data: existing } = await admin
          .from("entry_embeddings")
          .select("entry_id, content_hash")
          .eq("topic_id", bookId)
          .eq("user_id", userId);
        const existingHashes = new Map(
          (existing ?? []).map((e) => [Number(e.entry_id), String(e.content_hash)]),
        );
        const stale = rows.filter(
          (r) => existingHashes.get(Number(r.id)) !== hashContent(String(r.text)),
        );
        if (stale.length > 0) {
          const vectors = await embedTexts(
            geminiKey,
            stale.map((r) => String(r.text)),
            "RETRIEVAL_DOCUMENT",
          );
          const { error: upsertError } = await admin.from("entry_embeddings").upsert(
            stale.map((r, i) => ({
              entry_id: r.id,
              user_id: userId,
              topic_id: bookId,
              content_hash: hashContent(String(r.text)),
              embedding: JSON.stringify(vectors[i]),
              updated_at: new Date().toISOString(),
            })),
            { onConflict: "entry_id" },
          );
          if (upsertError) {
            throw new Error(`embedding upsert failed: ${upsertError.message}`);
          }
        }
        const [queryVector] = await embedTexts(geminiKey, [message], "RETRIEVAL_QUERY");
        const { data: matches, error: matchError } = await userClient.rpc(
          "match_entry_embeddings",
          {
            p_topic_id: bookId,
            p_query_embedding: JSON.stringify(queryVector),
            p_match_count: SEARCH_MATCH_COUNT,
          },
        );
        if (matchError) {
          throw new Error(`embedding match failed: ${matchError.message}`);
        }
        const results = (Array.isArray(matches) ? matches : [])
          .map((m: any) => ({ entryId: Number(m.entry_id), similarity: Number(m.similarity) }))
          .filter((m) => Number.isFinite(m.entryId) && m.similarity >= SEARCH_MIN_SIMILARITY);
        await finalize("succeeded", 200, {
          grounding_entries: rows.length,
          model: EMBEDDING_MODEL,
        });
        return jsonResponse({
          reply: {
            content:
              results.length > 0
                ? `${results.length} of your notes read close to that.`
                : "Nothing in your notes reads close to that. Perhaps it lies ahead of you.",
            provenance: "your_notes",
            declined: false,
          },
          boundaryLabel,
          quota,
          results,
        });
      } catch (searchFailure) {
        console.error("semantic search failed", searchFailure);
        await finalize("failed", 502, {
          error_code: "PROVIDER_ERROR",
          model: EMBEDDING_MODEL,
          error_message: truncate(String(searchFailure), 300),
        });
        return jsonResponse(
          { error: "The search could not run just now. Please try again.", code: "PROVIDER_ERROR" },
          502,
        );
      }
    }

    // Interface v2.0 ranges (D-055): the gold bookmark retells a chosen
    // stretch of entries; the club snapshot covers a calendar window. Both
    // re-scope the grounding context; the spoiler boundary stays global.
    let contextRows: { id: number; text: string | null; created_at: string | null }[] =
      oldestFirst;
    let rangeLabel: string | null = null;
    if (hasEntryRange) {
      const { data: bounds, error: boundsError } = await userClient
        .from("entries")
        .select("id, text, created_at")
        .in("id", [startEntryId, endEntryId])
        .eq("topic_id", bookId);
      const sortedBounds = [...(bounds ?? [])]
        .filter((b) => b.created_at)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      if (boundsError || sortedBounds.length === 0) {
        await finalize("failed", 400, { error_code: "RANGE_INVALID" });
        return jsonResponse({ error: "Those bookmarks could not be found.", code: "RANGE_INVALID" }, 400);
      }
      const { data: rangedRows, error: rangedError } = await userClient
        .from("entries")
        .select("id, text, created_at")
        .eq("topic_id", bookId)
        .gte("created_at", String(sortedBounds[0].created_at))
        .lte("created_at", String(sortedBounds[sortedBounds.length - 1].created_at))
        .order("created_at", { ascending: true })
        .limit(MAX_CONTEXT_ENTRIES);
      if (rangedError) {
        await finalize("failed", 503, { error_code: "CONTEXT_UNAVAILABLE" });
        return jsonResponse({ error: "Your notes could not be loaded. Please try again.", code: "CONTEXT_UNAVAILABLE" }, 503);
      }
      contextRows = rangedRows ?? [];
      const describe = (row: { text: string | null; created_at: string | null }) => {
        const parsed = parseBoundary(row.text);
        return parsed ? `${parsed.type} ${parsed.upper}` : String(row.created_at).slice(0, 10);
      };
      rangeLabel =
        sortedBounds.length === 2
          ? `from ${describe(sortedBounds[0])} to ${describe(sortedBounds[1])}`
          : `around ${describe(sortedBounds[0])}`;
    } else if (hasDateRange) {
      const { data: windowRows, error: windowError } = await userClient
        .from("entries")
        .select("id, text, created_at")
        .eq("topic_id", bookId)
        .gte("created_at", rangeStart!)
        .lte("created_at", rangeEnd!)
        .order("created_at", { ascending: true })
        .limit(MAX_CONTEXT_ENTRIES);
      if (windowError) {
        await finalize("failed", 503, { error_code: "CONTEXT_UNAVAILABLE" });
        return jsonResponse({ error: "Your notes could not be loaded. Please try again.", code: "CONTEXT_UNAVAILABLE" }, 503);
      }
      contextRows = windowRows ?? [];
      rangeLabel = `between ${rangeStart!.slice(0, 10)} and ${rangeEnd!.slice(0, 10)}`;
    }
    if ((hasEntryRange || hasDateRange) && contextRows.length === 0) {
      await finalize("succeeded", 200, { grounding_entries: 0, grounding_characters: 0 });
      return jsonResponse({
        code: "NO_ENTRIES_IN_RANGE",
        reply: {
          content:
            "You logged nothing in that stretch - the shelf between those markers is bare. Choose a wider range and I shall have something to work with.",
          provenance: "your_notes",
          declined: false,
        },
        boundaryLabel,
        quota,
      });
    }

    let contextChars = 0;
    const entryLines: string[] = [];
    const contextEntryIds = new Set<number>();
    // suggest_flags numbers each note so the model can point back at it.
    const includeIds = feature === "suggest_flags";
    for (const entry of contextRows) {
      const text = String(entry.text ?? "").trim();
      if (!text) continue;
      if (contextChars + text.length > MAX_CONTEXT_CHARS) break;
      contextChars += text.length;
      contextEntryIds.add(Number(entry.id));
      entryLines.push(
        `-${includeIds ? ` [#${entry.id}]` : ""} ${text.replace(/\n+/g, " / ")}`,
      );
    }
    const characterRows = charactersResult.data ?? [];
    const charactersBlock = characterRows
      .map((c) => `- ${c.name}${c.description ? `: ${String(c.description).replace(/\n+/g, " / ").slice(0, 400)}` : ""}`)
      .join("\n");
    const flavor = archetypeFlavor((genresResult.data ?? []).map((t) => t.genre));

    const systemPrompt = buildSystemPrompt({
      bookTitle: book.name,
      author: book.author,
      boundaryLabel,
      flavor,
      entriesBlock: entryLines.join("\n") || "(none)",
      charactersBlock,
      entryCount: entryLines.length,
      socratic: feature === "dialogue",
    });

    // Conversation history keeps the dialogue coherent across sittings.
    const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
    if (feature === "dialogue") {
      const { data: history } = await userClient
        .from("companion_messages")
        .select("role, content")
        .eq("topic_id", bookId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_MESSAGES);
      for (const row of (history ?? []).reverse()) {
        contents.push({
          role: row.role === "reader" ? "user" : "model",
          parts: [{ text: row.content }],
        });
      }
      contents.push({ role: "user", parts: [{ text: message }] });
    } else if (feature === "recap") {
      contents.push({
        role: "user",
        parts: [{ text: buildRecapPrompt(detail, entryLines.length, rangeLabel) }],
      });
    } else {
      contents.push({
        role: "user",
        parts: [
          {
            text: buildToolPrompt(feature, {
              entryCount: entryLines.length,
              characterCount: characterRows.length,
              detail,
              message,
              genre: book.genre ?? null,
              rangeLabel,
            }),
          },
        ],
      });
    }

    // 5. The provider call - reachable only past every gate above.
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
        }),
      },
    );
    if (!geminiResponse.ok) {
      const upstreamStatus = geminiResponse.status;
      await finalize("failed", 502, {
        upstream_status: upstreamStatus,
        error_code: "PROVIDER_ERROR",
        error_message: truncate(await geminiResponse.text(), 300),
      });
      return jsonResponse({ error: "The companion is momentarily lost in thought. Please try again.", code: "PROVIDER_ERROR" }, 502);
    }
    const geminiJson = await geminiResponse.json();
    const parsed = parseCompanionJson(extractGeminiText(geminiJson));
    if (!parsed.reply) {
      await finalize("failed", 502, { error_code: "EMPTY_REPLY" });
      return jsonResponse({ error: "The companion is momentarily lost in thought. Please try again.", code: "PROVIDER_ERROR" }, 502);
    }
    const usage = geminiJson?.usageMetadata ?? {};

    // suggest_flags: keep only suggestions that point at real context entries.
    const suggestions =
      feature === "suggest_flags"
        ? parsed.suggestions.filter((s) => contextEntryIds.has(s.entryId))
        : [];

    // Persist the exchange under the user's JWT so RLS owns the rows.
    // structure_aid and suggest_flags are transient aids - nothing is saved.
    const provenanceMeta = {
      sources: parsed.provenance,
      declined: parsed.declined,
      boundaryLabel,
      entryCount: entryLines.length,
    };
    const savedMessages: unknown[] = [];
    if (feature === "dialogue") {
      const { data: readerRow, error: readerError } = await userClient
        .from("companion_messages")
        .insert({ user_id: userId, topic_id: bookId, role: "reader", feature: "dialogue", content: message })
        .select("id, role, feature, content, provenance, created_at")
        .single();
      if (readerError) {
        await finalize("failed", 503, { error_code: "PERSIST_FAILED", error_message: truncate(readerError.message, 300) });
        return jsonResponse({ error: "The conversation could not be saved. Please try again.", code: "PERSIST_FAILED" }, 503);
      }
      savedMessages.push(readerRow);
    }
    const persistReply =
      feature === "dialogue" || feature === "recap" || PERSISTED_TOOL_FEATURES.includes(feature);
    if (persistReply) {
      const { data: companionRow, error: companionError } = await userClient
        .from("companion_messages")
        .insert({
          user_id: userId,
          topic_id: bookId,
          role: "companion",
          feature,
          content: parsed.reply,
          provenance: provenanceMeta,
        })
        .select("id, role, feature, content, provenance, created_at")
        .single();
      if (companionError) {
        await finalize("failed", 503, { error_code: "PERSIST_FAILED", error_message: truncate(companionError.message, 300) });
        return jsonResponse({ error: "The conversation could not be saved. Please try again.", code: "PERSIST_FAILED" }, 503);
      }
      savedMessages.push(companionRow);
    }

    await finalize("succeeded", 200, {
      prompt_tokens: Number(usage.promptTokenCount ?? 0) || null,
      output_tokens: Number(usage.candidatesTokenCount ?? 0) || null,
      grounding_entries: entryLines.length,
      grounding_characters: characterRows.length,
    });

    return jsonResponse({
      reply: { content: parsed.reply, provenance: parsed.provenance, declined: parsed.declined },
      boundaryLabel,
      quota,
      messages: savedMessages,
      ...(feature === "suggest_flags" ? { suggestions } : {}),
      ...(feature === "cue_cards" ? { cards: parsed.cards } : {}),
      ...(feature === "dialogue" ? { stems: parsed.stems } : {}),
      ...(feature === "observations" ? { observations: parsed.observations } : {}),
    });
  } catch (error) {
    console.error("companion unhandled error", error);
    return jsonResponse({ error: "Something went wrong. Please try again.", code: "UNEXPECTED" }, 500);
  }
});
