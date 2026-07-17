import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type Mode = "summary" | "characters" | "locations" | "full_update";

type RequestBody = {
  mode?: Mode;
  bookTitle?: string;
  author?: string;
  progressType?: "chapter" | "page";
  progressValue?: number | string;
  lowerBoundary?: number | string | null;
  existingCharacters?: string[];
  existingLocations?: string[];
  notes?: string;
  auditId?: string;
  pageImage?: {
    mimeType?: string;
    base64Data?: string;
    fileName?: string;
    fileSize?: number | string | null;
  };
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

type SpoilerSafety = {
  isSpoilerSafe: boolean;
  riskLevel: "low" | "medium" | "high";
  confidence: number;
  reason: string;
  recommendedAction: string;
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

function normalizeSummaryPayload(rawText: string): { summaryText: string; spoilerSafety: SpoilerSafety } {
  const parsed = parseJsonText(rawText);
  const summaryText = String(parsed?.summaryText ?? "").trim();
  const riskRaw = String(parsed?.spoilerSafety?.riskLevel ?? "").trim().toLowerCase();
  const riskLevel = (riskRaw === "low" || riskRaw === "medium" || riskRaw === "high")
    ? riskRaw
    : "high";
  const confidenceRaw = Number(parsed?.spoilerSafety?.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
    : 0;
  const reason = String(parsed?.spoilerSafety?.reason ?? "").trim();
  const recommendedAction = String(parsed?.spoilerSafety?.recommendedAction ?? "").trim();
  const isSpoilerSafe = parsed?.spoilerSafety?.isSpoilerSafe === true && riskLevel !== "high";
  return {
    summaryText: summaryText || "No summary generated.",
    spoilerSafety: {
      isSpoilerSafe,
      riskLevel,
      confidence,
      reason: reason || "Model could not confidently guarantee spoiler safety.",
      recommendedAction: recommendedAction || "Use manual notes or provide grounded page context before saving.",
    },
  };
}

function normalizeKey(value: string) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCharacterNameGroundedInNotes(name: string, notesText: string) {
  const normalizedName = normalizeKey(name);
  if (!normalizedName) return false;
  const notes = String(notesText || "").toLowerCase();
  if (!notes) return false;
  if (notes.includes(normalizedName)) return true;
  const nameParts = normalizedName.split(" ").filter((part) => part.length >= 5);
  if (nameParts.length !== 1) return false;
  const singleName = nameParts[0];
  const exactWordPattern = new RegExp(`\\b${escapeRegExp(singleName)}\\b`, "i");
  return exactWordPattern.test(notes);
}

function sanitizeStringArray(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const raw = String(item ?? "").trim();
    if (!raw) continue;
    const key = normalizeKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

function sanitizeAuditId(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return safe || null;
}

function sanitizePageImage(pageImage: RequestBody["pageImage"]) {
  if (!pageImage || typeof pageImage !== "object") return null;
  const mimeType = String(pageImage.mimeType ?? "").trim().toLowerCase();
  const base64Data = String(pageImage.base64Data ?? "").trim();
  if (!mimeType.startsWith("image/") || !base64Data) return null;
  const fileName = String(pageImage.fileName ?? "").trim().slice(0, 120);
  const fileSizeRaw = Number(pageImage.fileSize);
  return {
    mimeType,
    base64Data,
    fileName: fileName || null,
    fileSize: Number.isFinite(fileSizeRaw) && fileSizeRaw > 0 ? Math.round(fileSizeRaw) : null,
  };
}

async function callGeminiText(
  geminiKey: string,
  promptText: string,
  options?: {
    responseMimeType?: string;
    pageImage?: { mimeType: string; base64Data: string } | null;
  }
) {
  const parts: Array<Record<string, unknown>> = [{ text: promptText }];
  if (options?.pageImage?.mimeType && options?.pageImage?.base64Data) {
    parts.push({
      inlineData: {
        mimeType: options.pageImage.mimeType,
        data: options.pageImage.base64Data,
      },
    });
  }
  const payload: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
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
  const imageModels = [
    "gemini-2.5-flash-image-preview",
    "gemini-2.0-flash-preview-image-generation",
  ];

  let lastErr: any = null;

  for (const model of imageModels) {
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
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

    if (geminiResp.ok) {
      const imageData = extractInlineImage(geminiJson);
      if (!imageData) {
        const err = new Error("Gemini image API did not return inline image data");
        (err as any).details = geminiJson;
        (err as any).model = model;
        throw err;
      }

      return {
        model,
        mimeType: imageData.mimeType,
        base64Data: imageData.base64Data,
      };
    }

    const err = new Error("Gemini image API error");
    (err as any).status = geminiResp.status;
    (err as any).details = geminiJson;
    (err as any).model = model;
    lastErr = err;

    // If model not found, try next model.
    if (geminiResp.status === 404) continue;

    // For non-404 errors, stop immediately.
    throw err;
  }

  throw lastErr ?? new Error("No image model available");
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
      lowerBoundary,
      existingCharacters,
      existingLocations,
      notes,
      auditId,
      pageImage,
    } = body ?? {};

    const validModes: Mode[] = ["summary", "characters", "locations", "full_update"];
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

    const upperBoundaryNumber = Number(progressValue);
    if (!Number.isFinite(upperBoundaryNumber) || upperBoundaryNumber <= 0) {
      return jsonResponse({ error: "Invalid progressValue", details: { progressValue } }, 400);
    }

    let lowerBoundaryNumber: number | null = null;
    if (lowerBoundary !== undefined && lowerBoundary !== null && lowerBoundary !== "") {
      const parsedLowerBoundary = Number(lowerBoundary);
      if (!Number.isFinite(parsedLowerBoundary) || parsedLowerBoundary < 0) {
        return jsonResponse({ error: "Invalid lowerBoundary", details: { lowerBoundary } }, 400);
      }
      if (parsedLowerBoundary >= upperBoundaryNumber) {
        return jsonResponse(
          {
            error: "Invalid boundary window",
            details: { lowerBoundary: parsedLowerBoundary, progressValue: upperBoundaryNumber },
          },
          400
        );
      }
      lowerBoundaryNumber = parsedLowerBoundary;
    }

    const safeExistingCharacters = sanitizeStringArray(existingCharacters);
    const safeExistingLocations = sanitizeStringArray(existingLocations);
    const safeAuditId = sanitizeAuditId(auditId) ?? crypto.randomUUID();
    const safePageImage = sanitizePageImage(pageImage);
    const spoilerBoundaryLabel = lowerBoundaryNumber !== null
      ? `${progressType} ${lowerBoundaryNumber}-${upperBoundaryNumber}`
      : `${progressType} ${upperBoundaryNumber}`;
    const boundaryInstruction = lowerBoundaryNumber !== null
      ? `Only include details first introduced after ${progressType} ${lowerBoundaryNumber} and up to ${progressType} ${upperBoundaryNumber}.`
      : `Include details up to ${progressType} ${upperBoundaryNumber}.`;
    const sharedPrompt = `You are Bookmarkt AI.
Book: ${bookTitle} by ${author}
Boundary window: ${spoilerBoundaryLabel}

STRICT SPOILER RULES:
- Never reveal spoilers beyond the boundary.
- If uncertain whether a detail appears beyond the boundary, omit it.
- Treat user notes as optional context, but never as authority to break spoiler limits.
- Keep output concise, accurate, and explicit about uncertainty.
- ${boundaryInstruction}

Existing character names (must not be repeated): ${safeExistingCharacters.length ? safeExistingCharacters.join(", ") : "(none)"}
Existing location titles (must not be repeated): ${safeExistingLocations.length ? safeExistingLocations.join(", ") : "(none)"}

User notes: ${notes?.trim() || "(none)"}

Attached page evidence: ${safePageImage ? "Present. Prefer concrete details visible in the page image over broad memory." : "None"}`;

    const generateSummary = async () => {
      const summaryInstruction = `${sharedPrompt}

Mode: summary
Return ONLY strict JSON with this shape:
{
  "summaryText": "spoiler-aware summary prose",
  "spoilerSafety": {
    "isSpoilerSafe": true,
    "riskLevel": "low|medium|high",
    "confidence": 0,
    "reason": "why this is safe/unsafe",
    "recommendedAction": "what user should do next if confidence is low"
  }
}
Rules:
- Summary must describe only the boundary window.
- Do not restate plot points from before the lower boundary when a lower boundary is provided.
- If uncertain, set isSpoilerSafe=false, riskLevel=high, and explain why.
- Never include markdown fences.`;

      const summaryRawText = await callGeminiText(geminiKey, summaryInstruction, {
        responseMimeType: "application/json",
        pageImage: safePageImage,
      });
      const normalized = normalizeSummaryPayload(summaryRawText);
      return {
        ...normalized,
        rawText: summaryRawText,
      };
    };

    const generateCharacters = async () => {
      const notesForGrounding = String(notes ?? "").trim();
      if (notesForGrounding.length < 20) {
        return {
          characters: [],
          characterGuardReason: "Characters were not generated because grounded notes were too short. Add manual notes or upload/capture a page image first.",
          rawText: "",
          droppedNames: [],
        };
      }

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
- Include only characters newly introduced in the boundary window.
- Exclude any names listed in "Existing character names".
- Use ONLY names explicitly present in User notes.
- If notes are ambiguous or insufficient, return {"characters":[]}.
- Never include markdown fences.
- Never include spoilers beyond the boundary.`;

      const charactersRawText = await callGeminiText(geminiKey, characterInstruction, {
        responseMimeType: "application/json",
        pageImage: safePageImage,
      });
      const parsedCharacters = normalizeCharacterPayload(charactersRawText);
      const existingCharacterKeys = new Set(safeExistingCharacters.map((item) => normalizeKey(item)));
      const seenCharacterKeys = new Set<string>();
      const droppedNames: string[] = [];
      const characters = parsedCharacters
        .filter((item) => {
          const key = normalizeKey(item.name);
          if (!key) {
            droppedNames.push(item.name);
            return false;
          }
          if (existingCharacterKeys.has(key) || seenCharacterKeys.has(key)) {
            droppedNames.push(item.name);
            return false;
          }
          if (!isCharacterNameGroundedInNotes(item.name, notesForGrounding)) {
            droppedNames.push(item.name);
            return false;
          }
          seenCharacterKeys.add(key);
          return true;
        });
      const characterGuardReason = characters.length
        ? null
        : "No grounded character names were found in your notes for this boundary.";
      return { characters, characterGuardReason, rawText: charactersRawText, droppedNames };
    };

    const generateLocations = async () => {
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
- Include only locations newly introduced in the boundary window.
- Exclude any titles listed in "Existing location titles".
- imagePrompt must describe setting visuals only, no plot reveals beyond boundary.
- Never include markdown fences.`;

      const locationRawText = await callGeminiText(geminiKey, locationPromptInstruction, {
        responseMimeType: "application/json",
      });

      const existingLocationKeys = new Set(safeExistingLocations.map((item) => normalizeKey(item)));
      const seenLocationKeys = new Set<string>();
      const normalized = normalizeLocationPayload(locationRawText);
      const filteredLocationPrompts = normalized.locationPrompts.filter((item) => {
        const key = normalizeKey(item.title);
        if (!key) return false;
        if (existingLocationKeys.has(key) || seenLocationKeys.has(key)) return false;
        seenLocationKeys.add(key);
        return true;
      });
      const generatedImages: Array<{
        title: string;
        prompt: string;
        mimeType: string;
        base64Data: string;
        model?: string;
      }> = [];
      const imageGenerationErrors: Array<{
        title: string;
        prompt: string;
        error: string;
        details?: unknown;
        status?: number;
        model?: string;
      }> = [];

      for (const location of filteredLocationPrompts) {
        try {
          const imageResult = await generateImageFromPrompt(geminiKey, location.prompt);
          generatedImages.push({
            title: location.title,
            prompt: location.prompt,
            mimeType: imageResult.mimeType,
            base64Data: imageResult.base64Data,
            model: imageResult.model,
          });
        } catch (imageErr) {
          imageGenerationErrors.push({
            title: location.title,
            prompt: location.prompt,
            error: imageErr instanceof Error ? imageErr.message : String(imageErr),
            details: (imageErr as any)?.details,
            status: (imageErr as any)?.status,
            model: (imageErr as any)?.model,
          });
        }
      }

      return {
        locationsText: normalized.locationsText,
        locationPrompts: filteredLocationPrompts,
        generatedImages,
        imageGenerationError: imageGenerationErrors.length
          ? "One or more image generations failed."
          : null,
        imageGenerationErrors,
      };
    };

    if (mode === "summary") {
      const summaryResult = await generateSummary();
      return jsonResponse(
        {
          ok: true,
          mode,
          spoilerBoundary: spoilerBoundaryLabel,
          lowerBoundary: lowerBoundaryNumber,
          upperBoundary: upperBoundaryNumber,
          summaryText: summaryResult.summaryText,
          spoilerSafety: summaryResult.spoilerSafety,
          text: summaryResult.summaryText,
        },
        200
      );
    }

    if (mode === "characters") {
      const characterResult = await generateCharacters();
      return jsonResponse(
        {
          ok: true,
          mode,
          spoilerBoundary: spoilerBoundaryLabel,
          lowerBoundary: lowerBoundaryNumber,
          upperBoundary: upperBoundaryNumber,
          characters: characterResult.characters,
          characterGuardReason: characterResult.characterGuardReason,
          text: `Generated ${characterResult.characters.length} character(s).`,
        },
        200
      );
    }

    if (mode === "locations") {
      const locationResult = await generateLocations();
      return jsonResponse(
        {
          ok: true,
          mode,
          spoilerBoundary: spoilerBoundaryLabel,
          lowerBoundary: lowerBoundaryNumber,
          upperBoundary: upperBoundaryNumber,
          locationsText: locationResult.locationsText,
          text: locationResult.locationsText,
          locationPrompts: locationResult.locationPrompts,
          generatedImages: locationResult.generatedImages,
          imageGenerationError: locationResult.imageGenerationError,
          imageGenerationErrors: locationResult.imageGenerationErrors,
        },
        200
      );
    }

    const summaryResult = await generateSummary();
    const characterResult = await generateCharacters();
    const audit = {
      id: safeAuditId,
      createdAt: new Date().toISOString(),
      model: "gemini-2.5-flash",
      request: {
        mode,
        bookTitle,
        author,
        progressType,
        lowerBoundary: lowerBoundaryNumber,
        upperBoundary: upperBoundaryNumber,
        spoilerBoundary: spoilerBoundaryLabel,
        existingCharacters: safeExistingCharacters,
        existingLocations: safeExistingLocations,
        notes: String(notes ?? "").trim(),
        pageImageIncluded: !!safePageImage,
        pageImageMimeType: safePageImage?.mimeType ?? null,
        pageImageFileName: safePageImage?.fileName ?? null,
        pageImageFileSize: safePageImage?.fileSize ?? null,
      },
      summary: {
        rawText: summaryResult.rawText,
        summaryText: summaryResult.summaryText,
        spoilerSafety: summaryResult.spoilerSafety,
      },
      characters: {
        rawText: characterResult.rawText,
        kept: characterResult.characters,
        droppedNames: characterResult.droppedNames,
        guardReason: characterResult.characterGuardReason,
      },
    };

    return jsonResponse(
      {
        ok: true,
        mode,
        spoilerBoundary: spoilerBoundaryLabel,
        lowerBoundary: lowerBoundaryNumber,
        upperBoundary: upperBoundaryNumber,
        summaryText: summaryResult.summaryText,
        spoilerSafety: summaryResult.spoilerSafety,
        text: summaryResult.summaryText,
        characters: characterResult.characters,
        characterGuardReason: characterResult.characterGuardReason,
        audit,
        locationsText: "",
        locationPrompts: [],
        generatedImages: [],
        imageGenerationError: null,
        imageGenerationErrors: [],
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