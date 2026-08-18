import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createSupabaseContext } from "npm:@supabase/server@1";

type Mode = "summary" | "characters" | "locations" | "full_update";

type RequestBody = {
  mode?: Mode;
  bookTitle?: string;
  author?: string;
  aiDetailLevel?: "low" | "medium" | "high" | string;
  aiCharacterDetailLevel?: "low" | "medium" | "high" | string;
  publisher?: string | null;
  publicationYear?: number | string | null;
  totalPages?: number | string | null;
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
  modelConfidence?: number;
  reason: string;
  recommendedAction: string;
  evaluationReasons?: string[];
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
// D-012: AI generation is retired. Reading records are authored by the reader.
// The backend stays dormant behind this flag; set AI_GENERATION_ENABLED=true to revive it.
const AI_GENERATION_ENABLED = (Deno.env.get("AI_GENERATION_ENABLED") ?? "false").toLowerCase() === "true";
const DEFAULT_AI_DAILY_USER_LIMIT = 30;
const DEFAULT_AI_DAILY_PROJECT_LIMIT = 500;

type AIUsageStatus = "succeeded" | "failed";
type FinalizeAIUsage = (
  status: AIUsageStatus,
  httpStatus: number,
  errorCode?: string | null,
  errorMessage?: string | null,
  upstreamStatus?: number | null,
) => Promise<void>;

function readPositiveLimit(raw: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(maximum, Math.floor(parsed));
}

function truncateLogValue(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength) || null;
}

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

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeSummaryPayload(
  rawText: string,
  context: {
    hasPageImage: boolean;
    notesLength: number;
    hasLowerBoundary: boolean;
    boundarySpan: number | null;
  }
): { summaryText: string; spoilerSafety: SpoilerSafety } {
  const parsed = parseJsonText(rawText);
  const summaryText = String(parsed?.summaryText ?? "").trim();
  const riskRaw = String(parsed?.spoilerSafety?.riskLevel ?? "").trim().toLowerCase();
  const modelRiskLevel = (riskRaw === "low" || riskRaw === "medium" || riskRaw === "high")
    ? riskRaw
    : "high";
  const confidenceRaw = Number(parsed?.spoilerSafety?.confidence);
  const modelConfidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
    : 0;
  const modelReason = String(parsed?.spoilerSafety?.reason ?? "").trim();
  const modelRecommendedAction = String(parsed?.spoilerSafety?.recommendedAction ?? "").trim();
  const modelReportedSafe = parsed?.spoilerSafety?.isSpoilerSafe === true && modelRiskLevel !== "high";
  const evaluationReasons: string[] = [];
  let evaluatedConfidence = 85;

  if (modelRiskLevel === "medium") {
    evaluatedConfidence -= 20;
    evaluationReasons.push("Model flagged the summary as medium risk.");
  } else if (modelRiskLevel === "high") {
    evaluatedConfidence -= 45;
    evaluationReasons.push("Model flagged the summary as high risk.");
  }

  if (!modelReportedSafe) {
    evaluatedConfidence -= 20;
    evaluationReasons.push("Model did not affirm spoiler safety.");
  }

  if (modelConfidence < 35) {
    evaluatedConfidence -= 12;
    evaluationReasons.push(`Model self-confidence was only ${modelConfidence}%.`);
  } else if (modelConfidence < 60) {
    evaluatedConfidence -= 15;
    evaluationReasons.push(`Model self-confidence was moderate at ${modelConfidence}%.`);
  }

  if (!context.hasPageImage) {
    evaluatedConfidence -= 4;
    evaluationReasons.push("No page image evidence was provided.");
  }

  if (context.notesLength < 20) {
    evaluatedConfidence -= 8;
    evaluationReasons.push("Grounding notes were very short.");
  } else if (context.notesLength < 80) {
    evaluatedConfidence -= 4;
    evaluationReasons.push("Grounding notes were limited.");
  }

  if (!context.hasLowerBoundary) {
    evaluatedConfidence -= 5;
    evaluationReasons.push("No prior boundary existed, so the starting point was broad.");
  }

  if (context.boundarySpan !== null && context.boundarySpan > 40) {
    evaluatedConfidence -= 15;
    evaluationReasons.push("The boundary window spans more than 40 pages.");
  } else if (context.boundarySpan !== null && context.boundarySpan > 20) {
    evaluatedConfidence -= 8;
    evaluationReasons.push("The boundary window spans more than 20 pages.");
  }

  evaluatedConfidence = clampConfidence(evaluatedConfidence);
  const failedRules =
    modelRiskLevel === "high" ||
    !modelReportedSafe ||
    evaluatedConfidence < 45;
  const riskLevel: "low" | "medium" | "high" = failedRules
    ? (evaluatedConfidence < 40 || modelRiskLevel === "high" ? "high" : "medium")
    : "low";
  const isSpoilerSafe = !failedRules;
  const reason = [modelReason, ...evaluationReasons].filter(Boolean).join(" ");
  const recommendedAction = modelRecommendedAction
    || (context.hasPageImage
      ? "Tighten the boundary window or add more specific notes before saving."
      : "Add manual notes or page-specific image evidence before saving.");
  return {
    summaryText: summaryText || "No summary generated.",
    spoilerSafety: {
      isSpoilerSafe,
      riskLevel,
      confidence: evaluatedConfidence,
      modelConfidence,
      reason: reason || "Rule-based spoiler evaluation could not establish safe grounding.",
      recommendedAction,
      evaluationReasons,
    },
  };
}

function normalizeKey(value: string) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildBoundaryWindowLabel(
  progressType: "chapter" | "page",
  lowerBoundary: number | null,
  upperBoundary: number,
) {
  if (lowerBoundary !== null && Number.isFinite(lowerBoundary) && lowerBoundary > 0) {
    const windowStart = Math.min(Math.floor(lowerBoundary) + 1, upperBoundary);
    if (windowStart >= upperBoundary) {
      return `${progressType} ${upperBoundary}`;
    }
    return `${progressType} ${windowStart}-${upperBoundary}`;
  }
  return `${progressType} ${upperBoundary}`;
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
  if (!nameParts.length) return false;
  for (const part of nameParts) {
    const exactWordPattern = new RegExp(`\\b${escapeRegExp(part)}\\b`, "i");
    if (exactWordPattern.test(notes)) return true;
  }
  return false;
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

function sanitizeOptionalPositiveInt(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function sanitizeOptionalPublicationYear(value: unknown) {
  const parsed = sanitizeOptionalPositiveInt(value);
  if (!parsed) return null;
  const currentYear = new Date().getFullYear();
  if (parsed < 1000 || parsed > currentYear + 1) return null;
  return parsed;
}

function sanitizeAIDetailLevel(value: unknown): "low" | "medium" | "high" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return "high";
}

function sanitizeAICharacterDetailLevel(value: unknown): "low" | "medium" | "high" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return "medium";
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
  const requestStartedAt = Date.now();
  let finalizeUsage: FinalizeAIUsage | null = null;

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed", method: req.method }, 405);
  }

  if (!AI_GENERATION_ENABLED) {
    return jsonResponse(
      {
        ok: false,
        error: "AI generation is disabled. Bookmarkt reading records are authored by the reader (Decision D-012).",
        code: "AI_GENERATION_DISABLED",
      },
      410,
    );
  }

  try {
    const { data: authContext, error: authError } = await createSupabaseContext(req, { auth: "user" });
    if (authError || !authContext) {
      return jsonResponse(
        {
          error: "Authentication required. Please sign in again.",
          code: authError?.code ?? "UNAUTHORIZED",
        },
        authError?.status ?? 401,
      );
    }

    const userId = String(authContext.userClaims?.id ?? authContext.jwtClaims?.sub ?? "").trim();
    if (!userId) {
      return jsonResponse(
        { error: "Authentication required. Please sign in again.", code: "UNAUTHORIZED" },
        401,
      );
    }

    const body = (await req.json()) as RequestBody;
    const {
      mode,
      bookTitle,
      author,
      aiDetailLevel,
      aiCharacterDetailLevel,
      publisher,
      publicationYear,
      totalPages,
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

    let upperBoundaryNumber = Number(progressValue);
    if (!Number.isFinite(upperBoundaryNumber) || upperBoundaryNumber <= 0) {
      return jsonResponse({ error: "Invalid progressValue", details: { progressValue } }, 400);
    }
    const safePublisher = String(publisher ?? "").trim() || null;
    const safeAIDetailLevel = sanitizeAIDetailLevel(aiDetailLevel);
    const safeAICharacterDetailLevel = sanitizeAICharacterDetailLevel(aiCharacterDetailLevel);
    const safePublicationYear = sanitizeOptionalPublicationYear(publicationYear);
    const safeTotalPages = sanitizeOptionalPositiveInt(totalPages);
    let wasProgressCapped = false;
    if (progressType === "page" && safeTotalPages && upperBoundaryNumber > safeTotalPages) {
      upperBoundaryNumber = safeTotalPages;
      wasProgressCapped = true;
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
    const userDailyLimit = readPositiveLimit(
      Deno.env.get("AI_DAILY_USER_LIMIT"),
      DEFAULT_AI_DAILY_USER_LIMIT,
      500,
    );
    const projectDailyLimit = readPositiveLimit(
      Deno.env.get("AI_DAILY_PROJECT_LIMIT"),
      DEFAULT_AI_DAILY_PROJECT_LIMIT,
      100000,
    );
    const { data: quotaData, error: quotaError } = await authContext.supabaseAdmin.rpc(
      "consume_ai_daily_quota",
      {
        p_user_id: userId,
        p_mode: mode,
        p_audit_id: safeAuditId,
        p_user_daily_limit: userDailyLimit,
        p_project_daily_limit: projectDailyLimit,
      },
    );
    if (quotaError) {
      const err = new Error("AI usage protection is temporarily unavailable. Please try again shortly.");
      (err as any).code = "AI_QUOTA_UNAVAILABLE";
      (err as any).status = 503;
      (err as any).details = quotaError;
      throw err;
    }

    const quotaRow = Array.isArray(quotaData) ? quotaData[0] : quotaData;
    if (!quotaRow || !quotaRow.event_id) {
      const err = new Error("AI usage protection returned an invalid response.");
      (err as any).code = "AI_QUOTA_UNAVAILABLE";
      (err as any).status = 503;
      throw err;
    }

    const quotaScope = String(quotaRow.quota_scope || "user");
    const quota = {
      scope: quotaScope,
      limit: quotaScope === "project"
        ? Number(quotaRow.project_limit || projectDailyLimit)
        : Number(quotaRow.user_limit || userDailyLimit),
      used: quotaScope === "project"
        ? Number(quotaRow.project_used || 0)
        : Number(quotaRow.user_used || 0),
      remaining: Math.max(
        0,
        quotaScope === "project"
          ? Number(quotaRow.project_remaining || 0)
          : Number(quotaRow.user_remaining || 0),
      ),
      resetAt: quotaRow.reset_at,
    };
    if (quotaRow.allowed !== true) {
      const projectLimitReached = quota.scope === "project";
      return jsonResponse(
        {
          error: projectLimitReached
            ? "AI service capacity has been reached for today. Please try again after the daily reset."
            : "Daily AI limit reached (" + quota.limit + " generations). Please try again after the daily reset.",
          code: projectLimitReached ? "AI_PROJECT_DAILY_LIMIT_EXCEEDED" : "AI_DAILY_LIMIT_EXCEEDED",
          quota,
        },
        429,
      );
    }

    const usageEventId = Number(quotaRow.event_id);
    finalizeUsage = async (
      status,
      httpStatus,
      errorCode = null,
      errorMessage = null,
      upstreamStatus = null,
    ) => {
      try {
        const { error: updateError } = await authContext.supabaseAdmin
          .from("ai_usage_events")
          .update({
            status,
            completed_at: new Date().toISOString(),
            duration_ms: Math.max(0, Date.now() - requestStartedAt),
            http_status: httpStatus,
            upstream_status: upstreamStatus,
            error_code: truncateLogValue(errorCode, 80),
            error_message: truncateLogValue(errorMessage),
          })
          .eq("id", usageEventId)
          .eq("user_id", userId);
        if (updateError) console.error("Failed to finalize AI usage event", updateError);
      } catch (logError) {
        console.error("Failed to finalize AI usage event", logError);
      }
    };

    const successResponse = async (payload: Record<string, unknown>, status = 200) => {
      await finalizeUsage?.("succeeded", status);
      return jsonResponse({ ...payload, quota }, status);
    };
    const spoilerBoundaryLabel = buildBoundaryWindowLabel(progressType, lowerBoundaryNumber, upperBoundaryNumber);
    const boundaryInstruction = lowerBoundaryNumber !== null
      ? `Only include details first introduced after ${progressType} ${lowerBoundaryNumber}; the effective spoiler-safe window is ${spoilerBoundaryLabel}.`
      : `Include details up to ${progressType} ${upperBoundaryNumber}.`;
    const sharedPrompt = `You are Bookmarkt AI.
Book: ${bookTitle} by ${author}
Edition metadata: publisher=${safePublisher ?? "(unknown)"}, publication_year=${safePublicationYear ?? "(unknown)"}, total_pages=${safeTotalPages ?? "(unknown)"}
Boundary window: ${spoilerBoundaryLabel}

STRICT SPOILER RULES:
- Never reveal spoilers beyond the boundary.
- If uncertain whether a detail appears beyond the boundary, omit it.
- Treat user notes as grounded reader evidence for this boundary window when they are specific, but never as authority to break spoiler limits or invent missing details.
- Keep output concise, accurate, and explicit about uncertainty.
- ${boundaryInstruction}

Existing character names (must not be repeated): ${safeExistingCharacters.length ? safeExistingCharacters.join(", ") : "(none)"}
Existing location titles (must not be repeated): ${safeExistingLocations.length ? safeExistingLocations.join(", ") : "(none)"}

Grounded reader context: ${notes?.trim() || "(none)"}

Attached page evidence: ${safePageImage ? "Present. Prefer concrete details visible in the page image over broad memory." : "None"}

Requested summary detail level: ${safeAIDetailLevel.toUpperCase()}
Requested character detail level: ${safeAICharacterDetailLevel.toUpperCase()}`;
    const summaryDetailInstruction = safeAIDetailLevel === "low"
      ? "Write a very concise summary (target 2 to 3 sentences) focused only on the most important boundary-safe developments."
      : safeAIDetailLevel === "medium"
        ? "Write a concise summary (target 4 to 6 sentences) covering major boundary-safe developments and key character actions."
        : "Write a concrete, specific summary (target 6 to 10 sentences).";
    const characterDetailInstruction = safeAICharacterDetailLevel === "low"
      ? "Character detail LOW: include only main characters central to this boundary window (target 1 to 4); exclude minor/supporting mentions."
      : safeAICharacterDetailLevel === "medium"
        ? "Character detail MEDIUM: include important characters needed to follow this boundary window (target 3 to 8); include key supporting characters only."
        : "Character detail HIGH: include all clearly relevant spoiler-safe characters in this boundary window (target 6 to 15), including supporting characters.";
    const bootstrapCharacterInstruction = safeAICharacterDetailLevel === "low"
      ? `Existing character names is empty — build a compact initial map of main characters only (target 2 to 4) introduced up to ${progressType} ${upperBoundaryNumber}.`
      : safeAICharacterDetailLevel === "medium"
        ? `Existing character names is empty — build an initial map of important characters (target 4 to 9) introduced up to ${progressType} ${upperBoundaryNumber}.`
        : `Existing character names is empty — build a complete initial character map; include 6 to 15 important spoiler-safe characters introduced by this boundary.`;

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
- ${summaryDetailInstruction}
- You may rely on Grounded reader context and attached page evidence; direct access to the full book text is not required.
- If Grounded reader context is limited, still provide the safest concise best-effort summary you can from boundary-aware book knowledge instead of refusing outright.
- Do not restate plot points from before the lower boundary when a lower boundary is provided.
- If grounded context is available, produce the safest concise summary supported by that context instead of refusing only because the full book text is unavailable.
- When uncertainty is significant, keep the summary cautious, narrow, and mark spoilerSafety as unsafe/low confidence rather than returning a refusal message.
- If there is no meaningful grounded context for the boundary window, still provide a careful boundary-limited best-effort summary and reflect uncertainty in spoilerSafety.
- Prefer concrete actions, character decisions, and immediate consequences over thematic or meta-level phrasing.
- Avoid vague phrasing like "the story drives toward resolution" when concrete boundary-safe details are available.
- Never include markdown fences.`;

      const summaryRawText = await callGeminiText(geminiKey, summaryInstruction, {
        responseMimeType: "application/json",
        pageImage: safePageImage,
      });
      const normalized = normalizeSummaryPayload(summaryRawText, {
        hasPageImage: !!safePageImage,
        notesLength: String(notes ?? "").trim().length,
        hasLowerBoundary: lowerBoundaryNumber !== null,
        boundarySpan: lowerBoundaryNumber !== null ? Math.max(0, upperBoundaryNumber - lowerBoundaryNumber) : null,
      });
      return {
        ...normalized,
        rawText: summaryRawText,
      };
    };

    const generateCharacters = async (summaryGroundingText?: string) => {
      const notesForGrounding = String(notes ?? "").trim();
      const summaryForGrounding = String(summaryGroundingText ?? "").trim();
      const combinedGroundingText = [notesForGrounding, summaryForGrounding]
        .filter((value) => !!value)
        .join("\n\n")
        .trim();
      const isCharacterBootstrap = safeExistingCharacters.length === 0;
      const boundarySpan = lowerBoundaryNumber !== null
        ? Math.max(0, upperBoundaryNumber - lowerBoundaryNumber)
        : null;
      const allowSummaryFallback = !safePageImage
        && !notesForGrounding
        && summaryForGrounding.length >= 120
        && (boundarySpan === null || boundarySpan <= 30);
      if (combinedGroundingText.length < 8 && !safePageImage) {
        return {
          characters: [],
          characterGuardReason: "Characters were not generated because grounded context was too short. Add manual notes, upload/capture a page image, or retry after generating a stronger summary.",
          rawText: "",
          droppedNames: [],
        };
      }

      const existingCharacterKeys = new Set(safeExistingCharacters.map((item) => normalizeKey(item)));
      const seenCharacterKeys = new Set<string>();
      const filterCharacters = (items: CharacterItem[]) => {
        const droppedNames: string[] = [];
        const characters = items.filter((item) => {
          const key = normalizeKey(item.name);
          if (!key) {
            droppedNames.push(item.name);
            return false;
          }
          if (existingCharacterKeys.has(key) || seenCharacterKeys.has(key)) {
            droppedNames.push(item.name);
            return false;
          }
          seenCharacterKeys.add(key);
          return true;
        });
        return { characters, droppedNames };
      };

      const characterInstruction = `${sharedPrompt}

Grounded summary context: ${summaryForGrounding || "(none)"}

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
- ${characterDetailInstruction}
- Include spoiler-safe characters who are relevant in this boundary window and useful for the reader's character map.
- If Existing character names is "(none)", ${bootstrapCharacterInstruction}
- Exclude any names listed in "Existing character names".
- Prefer names explicitly present in Grounded reader context, Grounded summary context, or attached page evidence.
- You may also include high-confidence core characters that are clearly introduced by this boundary, even if the grounded notes omitted their names.
- Prefer adding at least one grounded character when the evidence clearly names someone in the boundary window.
- If the grounded context is ambiguous or insufficient, return {"characters":[]}.
- Never include markdown fences.
- Never include spoilers beyond the boundary.`;

      const charactersRawText = await callGeminiText(geminiKey, characterInstruction, {
        responseMimeType: "application/json",
        pageImage: safePageImage,
      });
      const parsedCharacters = normalizeCharacterPayload(charactersRawText);
      const primaryFiltered = filterCharacters(parsedCharacters);
      let mergedCharacters = primaryFiltered.characters.slice();
      let mergedDroppedNames = primaryFiltered.droppedNames.slice();
      const rawTextParts = [charactersRawText];

      if (!mergedCharacters.length && allowSummaryFallback) {
        const fallbackInstruction = `${sharedPrompt}

Grounded summary context: ${summaryForGrounding}

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
- ${characterDetailInstruction}
- If Existing character names is "(none)", ${bootstrapCharacterInstruction}
- Exclude any names listed in "Existing character names".
- You may recover a full character name from book context when the grounded summary clearly refers to that character, even if the exact full name is not repeated verbatim.
- Prefer well-established or clearly evidenced characters over speculative minor figures.
- If uncertain about a character's identity, omit that character.
- Never include markdown fences.
- Never include spoilers beyond the boundary.`;

        const fallbackRawText = await callGeminiText(geminiKey, fallbackInstruction, {
          responseMimeType: "application/json",
        });
        rawTextParts.push(`[FALLBACK]\n${fallbackRawText}`);
        const fallbackParsedCharacters = normalizeCharacterPayload(fallbackRawText);
        const fallbackFiltered = filterCharacters(fallbackParsedCharacters);
        mergedCharacters = mergedCharacters.concat(fallbackFiltered.characters);
        mergedDroppedNames = mergedDroppedNames.concat(fallbackFiltered.droppedNames);
      }

      if (isCharacterBootstrap && !mergedCharacters.length) {
        const bootstrapInstruction = `${sharedPrompt}

Grounded summary context: ${summaryForGrounding || "(none)"}

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
- Existing character names are empty, so build an initial character map.
- ${bootstrapCharacterInstruction}
- Do not include characters first introduced after ${progressType} ${upperBoundaryNumber}.
- Prioritize major and recurring characters over speculative or minor uncertain figures.
- Never include markdown fences.
- Never include spoilers beyond the boundary.`;
        const bootstrapRawText = await callGeminiText(geminiKey, bootstrapInstruction, {
          responseMimeType: "application/json",
        });
        rawTextParts.push(`[BOOTSTRAP]\n${bootstrapRawText}`);
        const bootstrapParsedCharacters = normalizeCharacterPayload(bootstrapRawText);
        const bootstrapFiltered = filterCharacters(bootstrapParsedCharacters);
        mergedCharacters = mergedCharacters.concat(bootstrapFiltered.characters);
        mergedDroppedNames = mergedDroppedNames.concat(bootstrapFiltered.droppedNames);
      }

      // Reconcile pass is expensive; only run it when primary/fallback extraction returned too few additions.
      if (!isCharacterBootstrap && mergedCharacters.length < 4) {
        const reconcileInstruction = `${sharedPrompt}

Grounded summary context: ${summaryForGrounding || "(none)"}

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
- Existing character names are already saved in the map.
- ${characterDetailInstruction}
- Add spoiler-safe characters introduced up to ${progressType} ${upperBoundaryNumber} that are likely missing from the current map.
- Exclude any names listed in "Existing character names".
- Prioritize important recurring characters that should be in the map by this reading stage.
- Never include markdown fences.
- Never include spoilers beyond the boundary.`;
        const reconcileRawText = await callGeminiText(geminiKey, reconcileInstruction, {
          responseMimeType: "application/json",
          pageImage: safePageImage,
        });
        rawTextParts.push(`[RECONCILE]\n${reconcileRawText}`);
        const reconcileParsedCharacters = normalizeCharacterPayload(reconcileRawText);
        const reconcileFiltered = filterCharacters(reconcileParsedCharacters);
        mergedCharacters = mergedCharacters.concat(reconcileFiltered.characters);
        mergedDroppedNames = mergedDroppedNames.concat(reconcileFiltered.droppedNames);
      }

      const characterGuardReason = mergedCharacters.length
        ? null
        : safePageImage
          ? "No spoiler-safe characters could be confirmed from the available notes, summary context, or page evidence."
          : "No spoiler-safe characters could be confirmed for this boundary window.";
      return {
        characters: mergedCharacters,
        characterGuardReason,
        rawText: rawTextParts.join("\n\n"),
        droppedNames: mergedDroppedNames,
      };
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
      return await successResponse(
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
      return await successResponse(
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
      return await successResponse(
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

    // For full_update, use a single combined call to halve round-trip latency.
    const isBootstrap = safeExistingCharacters.length === 0;
    const fullUpdateInstruction = `${sharedPrompt}

Mode: full_update
Return ONLY strict JSON with this exact shape (no markdown fences):
{
  "summaryText": "spoiler-aware summary prose",
  "spoilerSafety": {
    "isSpoilerSafe": true,
    "riskLevel": "low|medium|high",
    "confidence": 0,
    "reason": "why this is safe/unsafe",
    "recommendedAction": "what the user should do next if confidence is low"
  },
  "characters": [
    {
      "name": "character name",
      "role": "spoiler-safe role up to boundary",
      "description": "spoiler-safe description up to boundary",
      "relationships": "spoiler-safe relationship notes up to boundary"
    }
  ]
}

Summary rules:
- Describe only the boundary window (${spoilerBoundaryLabel}).
- ${summaryDetailInstruction}
- Prefer concrete actions, character decisions, and consequences over thematic phrasing.
- If Grounded reader context is limited, provide the safest best-effort summary from boundary-aware knowledge instead of refusing.
- Never reveal spoilers beyond the boundary.
- Never include markdown fences.

Character rules:
- ${characterDetailInstruction}
- Include every named character who appears or is clearly referenced up to ${progressType} ${upperBoundaryNumber}.
- ${isBootstrap ? bootstrapCharacterInstruction : `Add characters who are NOT in "Existing character names". Exclude any name listed there.`}
- Characters you mention in your summary MUST appear in the characters array (never omit them).
- Include any character named in Grounded reader context even if you also mention them in the summary.
- Do not limit yourself to only characters with heavy page-time; include supporting characters if they are clearly introduced.
- Never reveal spoilers beyond the boundary.`;

    const fullUpdateRawText = await callGeminiText(geminiKey, fullUpdateInstruction, {
      responseMimeType: "application/json",
      pageImage: safePageImage,
    });

    // Parse the combined response.
    let parsedFullUpdate: any = {};
    try {
      parsedFullUpdate = parseJsonText(fullUpdateRawText);
    } catch {
      parsedFullUpdate = {};
    }

    const combinedSummaryText = String(parsedFullUpdate?.summaryText ?? "").trim();
    const combinedSpoilerSafety = parsedFullUpdate?.spoilerSafety ?? {};

    // Normalize summary using existing logic.
    const syntheticSummaryRaw = JSON.stringify({ summaryText: combinedSummaryText, spoilerSafety: combinedSpoilerSafety });
    const summaryResult = {
      ...(normalizeSummaryPayload(syntheticSummaryRaw, {
        hasPageImage: !!safePageImage,
        notesLength: String(notes ?? "").trim().length,
        hasLowerBoundary: lowerBoundaryNumber !== null,
        boundarySpan: lowerBoundaryNumber !== null ? Math.max(0, upperBoundaryNumber - lowerBoundaryNumber) : null,
      })),
      rawText: fullUpdateRawText,
    };

    // Extract characters from combined response.
    const combinedCharactersRaw = Array.isArray(parsedFullUpdate?.characters) ? parsedFullUpdate.characters : [];
    const combinedCharacters: CharacterItem[] = combinedCharactersRaw
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

    const existingCharacterKeys = new Set(safeExistingCharacters.map((item) => normalizeKey(item)));
    const seenCharacterKeys = new Set<string>();
    const uniqueCharacters: CharacterItem[] = [];
    const droppedNames: string[] = [];
    for (const item of combinedCharacters) {
      const key = normalizeKey(item.name);
      if (!key) { droppedNames.push(item.name); continue; }
      if (existingCharacterKeys.has(key) || seenCharacterKeys.has(key)) { droppedNames.push(item.name); continue; }
      seenCharacterKeys.add(key);
      uniqueCharacters.push(item);
    }

    const characterResult = {
      characters: uniqueCharacters,
      characterGuardReason: uniqueCharacters.length
        ? null
        : "No spoiler-safe characters could be confirmed for this boundary window.",
      rawText: fullUpdateRawText,
      droppedNames,
    };

    const audit = {
      id: safeAuditId,
      createdAt: new Date().toISOString(),
      model: "gemini-2.5-flash",
      request: {
        mode,
        bookTitle,
        author,
        aiDetailLevel: safeAIDetailLevel,
        aiCharacterDetailLevel: safeAICharacterDetailLevel,
        publisher: safePublisher,
        publicationYear: safePublicationYear,
        totalPages: safeTotalPages,
        wasProgressCapped,
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

    return await successResponse(
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
    const errorMessage = e instanceof Error ? e.message : String(e);
    const rawStatus = Number((e as any)?.status);
    const upstreamStatus = Number.isFinite(rawStatus) && rawStatus >= 100 && rawStatus <= 599
      ? rawStatus
      : null;
    const errorCode = truncateLogValue(
      (e as any)?.code
        ?? (upstreamStatus === 429 ? "AI_PROVIDER_RATE_LIMITED" : "AI_GENERATION_FAILED"),
      80,
    );
    const responseStatus = errorCode === "AI_QUOTA_UNAVAILABLE"
      ? 503
      : upstreamStatus === 429
        ? 503
        : 500;
    await finalizeUsage?.("failed", responseStatus, errorCode, errorMessage, upstreamStatus);
    console.error("ai-bookmate request failed", { errorCode, upstreamStatus, error: errorMessage });
    return jsonResponse(
      {
        error: upstreamStatus === 429
          ? "AI service is temporarily busy. Please try again shortly."
          : errorMessage,
        code: errorCode,
      },
      responseStatus,
    );
  }
});
