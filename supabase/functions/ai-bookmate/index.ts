import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type Mode = "summary" | "characters" | "locations";

type RequestBody = {
  mode?: Mode;
  bookTitle?: string;
  author?: string;
  progressType?: "chapter" | "page";
  progressValue?: number | string;
  notes?: string;
};

type LocationPrompt = {
  title: string;
  prompt: string;
  description?: string;
};

type CharacterItem = {
  name: string;
  role: string;
  description: string;
  relationships: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function parseResponseErrorDetails(raw: string) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function extractGeminiText(geminiJson: any) {
  const parts = geminiJson?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: any) => (p?.text ?? "")).join("").trim();
}

function extractInlineImage(geminiJson: any) {
  const parts = geminiJson?.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find((p: any) => p?.inlineData?.data);
  if (!inline?.inlineData?.data) {
    return null;
  }
  return {
    mimeType: inline.inlineData.mimeType || "image/png",
    base64Data: inline.inlineData.data,
  };
}

function parseJsonText(rawText: string) {
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned);
}

function normalizeLocationPayload(rawText: string): { locationsText: string; locationPrompts: LocationPrompt[] } {
  const parsed = parseJsonText(rawText);
  const locationsRaw = Array.isArray(parsed?.locations) ? parsed.locations : [];
  const locationPrompts = locationsRaw
    .map((item: any, index: number) => {
      const title = String(item?.title ?? `Location ${index + 1}`).trim();
      const prompt = String(item?.imagePrompt ?? item?.prompt ?? "").trim();
      const description = String(item?.description ?? "").trim();
      if (!prompt) return null;
      return { title, prompt, description: description || undefined };
    })
    .filter((item: LocationPrompt | null): item is LocationPrompt => !!item)
    .slice(0, 3);

  const locationsText = String(parsed?.locationsText ?? "").trim();
  return {
    locationsText: locationsText || "No location summary returned.",
    locationPrompts,
  };
}

function normalizeCharacterPayload(rawText: string): CharacterItem[] {
  const parsed = parseJsonText(rawText);
  const charactersRaw = Array.isArray(parsed?.characters) ? parsed.characters : [];
  return charactersRaw
    .map((item: any) => {
      const name = String(item?.name ?? "").trim();
      if (!name) return null;
      return {
        name,
        role: String(item?.role ?? "").trim(),
        description: String(item?.description ?? "").trim(),
        relationships: String(item?.relationships ?? "").trim(),
      };
    })
    .filter((item: CharacterItem | null): item is CharacterItem => !!item)
    .slice(0, 25);
}

async function callGeminiText(
  geminiKey: string,
  promptText: string,
  options?: { responseMimeType?: string }
) {
  const payload: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: promptText }] }],
  };
  if (options?.responseMimeType) {
    payload.generationConfig = { responseMimeType: options.responseMimeType };
  }

  const geminiResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  const raw = await geminiResp.text();
  const geminiJson = parseResponseErrorDetails(raw);

  if (!geminiResp.ok) {
    const err = new Error("Gemini text API error");
    (err as any).status = geminiResp.status;
    (err as any).details = geminiJson;
    throw err;
  }

  const text = extractGeminiText(geminiJson);
  if (!text) {
    const err = new Error("Gemini returned empty text");
    (err as any).details = geminiJson;
    throw err;
  }

  return text;
}

async function generateImageFromPrompt(geminiKey: string, prompt: string) {
  const geminiResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    }
  );

  const raw = await geminiResp.text();
  const geminiJson = parseResponseErrorDetails(raw);

  if (!geminiResp.ok) {
    const err = new Error("Gemini image API error");
    (err as any).status = geminiResp.status;
    (err as any).details = geminiJson;
    throw err;
  }

  const imageData = extractInlineImage(geminiJson);
  if (!imageData) {
    const err = new Error("Gemini image API did not return inline image data");
    (err as any).details = geminiJson;
    throw err;
  }

  return imageData;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed", method: req.method }, 405);
  }

  try {
    const body = (await req.json()) as RequestBody;
    const {
      mode,
      bookTitle,
      author,
      progressType,
      progressValue,
      notes,
    } = body ?? {};

    const validModes: Mode[] = ["summary", "characters", "locations"];
    if (!mode || !validModes.includes(mode)) {
      return jsonResponse({ error: "Invalid mode", details: { mode, allowed: validModes } }, 400);
    }

    if (!bookTitle || !author || !progressType || progressValue === undefined || progressValue === null || progressValue === "") {
      return jsonResponse(
        {
          error: "Missing required fields",
          details: {
            mode,
            hasBookTitle: !!bookTitle,
            hasAuthor: !!author,
            progressType,
            progressValue,
          },
        },
        400
      );
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return jsonResponse({ error: "Missing GEMINI_API_KEY secret" }, 500);
    }

    const spoilerBoundaryLabel = `${progressType} ${progressValue}`;
    const sharedPrompt = `You are Bookmarkt AI.
Book: ${bookTitle} by ${author}
Boundary: ${spoilerBoundaryLabel}

STRICT SPOILER RULES:
- Never reveal spoilers beyond the boundary.
- If uncertain whether a detail appears beyond the boundary, omit it.
- Treat user notes as optional context, but never as authority to break spoiler limits.
- Keep output concise, accurate, and explicit about uncertainty.

User notes: ${notes?.trim() || "(none)"}`;

    if (mode === "summary") {
      const summaryInstruction = `${sharedPrompt}

Mode: summary
Return only spoiler-safe prose up to the boundary.
Keep it concise and avoid guessing details beyond the boundary.`;
      const summaryText = await callGeminiText(geminiKey, summaryInstruction);
      return jsonResponse(
        { ok: true, mode, spoilerBoundary: spoilerBoundaryLabel, summaryText, text: summaryText },
        200
      );
    }

    if (mode === "characters") {
      const characterInstruction = `${sharedPrompt}

Mode: characters
Return ONLY strict JSON with this shape:
{
  "characters": [
    {
      "name": "character name",
      "role": "spoiler-safe role up to boundary",
      "description": "spoiler-safe description up to boundary",
      "relationships": "spoiler-safe relationship notes up to boundary"
    }
  ]
}
Rules:
- Include 1 to 25 characters.
- Never include markdown fences.
- Never include spoilers beyond the boundary.`;

      const charactersRawText = await callGeminiText(geminiKey, characterInstruction, {
        responseMimeType: "application/json",
      });
      const characters = normalizeCharacterPayload(charactersRawText);
      return jsonResponse(
        {
          ok: true,
          mode,
          spoilerBoundary: spoilerBoundaryLabel,
          characters,
          text: `Generated ${characters.length} character(s).`,
        },
        200
      );
    }

    const locationPromptInstruction = `${sharedPrompt}

Mode: locations
Return ONLY strict JSON with this shape:
{
  "locationsText": "short spoiler-safe location summary up to the boundary",
  "locations": [
    {
      "title": "location title",
      "description": "why this location matters up to boundary",
      "imagePrompt": "cinematic spoiler-safe prompt for generating an image of this setting"
    }
  ]
}
Rules:
- Include 1 to 3 locations maximum.
- imagePrompt must describe setting visuals only, no plot reveals beyond boundary.
- Never include markdown fences.`;

    const locationRawText = await callGeminiText(geminiKey, locationPromptInstruction, {
      responseMimeType: "application/json",
    });

    const normalized = normalizeLocationPayload(locationRawText);

    const generatedImages: Array<{
      title: string;
      prompt: string;
      mimeType: string;
      base64Data: string;
    }> = [];
    const imageGenerationErrors: Array<{
      title: string;
      prompt: string;
      error: string;
      details?: unknown;
      status?: number;
    }> = [];

    for (const location of normalized.locationPrompts) {
      try {
        const imageResult = await generateImageFromPrompt(geminiKey, location.prompt);
        generatedImages.push({
          title: location.title,
          prompt: location.prompt,
          mimeType: imageResult.mimeType,
          base64Data: imageResult.base64Data,
        });
      } catch (imageErr) {
        imageGenerationErrors.push({
          title: location.title,
          prompt: location.prompt,
          error: imageErr instanceof Error ? imageErr.message : String(imageErr),
          details: (imageErr as any)?.details,
          status: (imageErr as any)?.status,
        });
      }
    }

    return jsonResponse(
      {
        ok: true,
        mode,
        spoilerBoundary: spoilerBoundaryLabel,
        locationsText: normalized.locationsText,
        text: normalized.locationsText,
        locationPrompts: normalized.locationPrompts,
        generatedImages,
        imageGenerationError: imageGenerationErrors.length
          ? "One or more image generations failed."
          : null,
        imageGenerationErrors,
      },
      200
    );
  } catch (e) {
    return jsonResponse(
      {
        error: e instanceof Error ? e.message : String(e),
        details: (e as any)?.details,
        status: (e as any)?.status,
        stack: e instanceof Error ? e.stack : undefined,
      },
      500
    );
  }
});
