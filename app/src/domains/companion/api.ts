/**
 * Client for the `companion` Edge Function (Stage 4 Phase 2). The function
 * is the sole gatekeeper — auth, entitlement, and quota are all enforced
 * server-side before any provider call — so this module only shapes
 * requests, normalizes responses, and translates denials into typed errors
 * the UI can render (subscription offer, daily limit, friendly failures).
 */

import type { Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type CompanionProvenance = 'your_notes' | 'general_knowledge' | 'mixed';

/** Tools that persist their result into the conversation (D-039 feature set). */
export type CompanionToolFeature = 'cue_cards' | 'quiz' | 'club_prep' | 'word_bank';

export type WordBankLevel = 'simple' | 'standard' | 'scholarly';

/** Detail levels for story summaries (gold bookmark, D-055). */
export type RecapDetail = 'brief' | 'standard' | 'detailed';

/** One flip card: a terse cue on the front, the answer on the back (D-055). */
export interface CompanionCueCard {
  front: string;
  back: string;
}

/** A refreshed bookmark-ribbon summary for one entry (D-055). */
export interface CompanionEntrySummary {
  entryId: number;
  summary: string;
}

export interface CompanionFlagSuggestion {
  entryId: number;
  reason: string;
}

export interface CompanionSearchResult {
  entryId: number;
  similarity: number;
}

/** An observation card: a grounded conversation opener (D-056/D-057). */
export interface CompanionObservation {
  prompt: string;
  /** 2-3 short perspective fragments the reader can open an answer with. */
  stems: string[];
}

export interface CompanionQuota {
  used: number;
  remaining: number;
  limit: number;
  resetAt: string | null;
}

export interface CompanionChatMessage {
  id: number;
  role: 'reader' | 'companion';
  feature: string;
  content: string;
  createdAt: string;
  /** Session salon (D-058) the message belongs to; null for legacy rows. */
  salonId: string | null;
  /** Companion messages carry provenance; reader messages have none. */
  provenance: CompanionProvenance | null;
  declined: boolean;
  boundaryLabel: string | null;
}

export interface CompanionSendResult {
  reply: { content: string; provenance: CompanionProvenance; declined: boolean };
  boundaryLabel: string | null;
  quota: CompanionQuota | null;
  messages: CompanionChatMessage[];
  /** Set for empty-context short-circuits (NO_ENTRIES, NO_CHARACTERS). */
  code: string | null;
  /** Present only for suggest_flags: entries that look like pivotal moments. */
  suggestions: CompanionFlagSuggestion[];
  /** Present only for semantic_search: matching entries, best first. */
  results: CompanionSearchResult[];
  /** Present only for cue_cards: the deck, front/back per card. */
  cards: CompanionCueCard[];
  /** Present only for entry_summaries: the ribbon labels just refreshed. */
  summaries: CompanionEntrySummary[];
  /** Present only for dialogue: short answer stems for the reply (D-056). */
  stems: string[];
  /** Present only for observations: grounded conversation openers (D-056). */
  observations: CompanionObservation[];
  /** Convergence arc (D-059), dialogue only: the one-sentence validation. */
  mirror: string;
  /** Convergence arc (D-059), dialogue only: the wedge question or affirmation. */
  probe: string;
  /** Convergence arc (D-059): true when this reply is the synthesis card. */
  isConvergence: boolean;
  /** Convergence arc (D-059): the stand-alone takeaway sentence, synthesis only. */
  insight: string;
}

/** A denial or failure from the companion service, typed for the UI. */
export class CompanionRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly quota: CompanionQuota | null;

  constructor(message: string, code: string, status: number, quota: CompanionQuota | null = null) {
    super(message);
    this.name = 'CompanionRequestError';
    this.code = code;
    this.status = status;
    this.quota = quota;
  }

  get subscriptionRequired(): boolean {
    return this.code === 'COMPANION_SUBSCRIPTION_REQUIRED';
  }

  get quotaExceeded(): boolean {
    return (
      this.code === 'COMPANION_DAILY_LIMIT_EXCEEDED' ||
      this.code === 'COMPANION_PROJECT_DAILY_LIMIT_EXCEEDED'
    );
  }
}

const FALLBACK_MESSAGES: Record<number, string> = {
  401: 'Please sign in again to talk with the companion.',
  402: 'The companion is part of the paid plan.',
  429: "You've reached today's companion limit. It resets tomorrow.",
};

function parseQuota(raw: unknown): CompanionQuota | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const quota = raw as { used?: unknown; remaining?: unknown; limit?: unknown; resetAt?: unknown };
  return {
    used: Number(quota.used ?? 0),
    remaining: Number(quota.remaining ?? 0),
    limit: Number(quota.limit ?? 0),
    resetAt: typeof quota.resetAt === 'string' ? quota.resetAt : null,
  };
}

/** Pure: build the typed error from an HTTP status + response payload. */
export function companionErrorFromPayload(status: number, payload: unknown): CompanionRequestError {
  const body =
    payload && typeof payload === 'object'
      ? (payload as { error?: unknown; code?: unknown; quota?: unknown })
      : {};
  const message =
    (typeof body.error === 'string' && body.error.trim()) ||
    FALLBACK_MESSAGES[status] ||
    'The companion could not respond. Please try again.';
  const code = (typeof body.code === 'string' && body.code) || `HTTP_${status || 0}`;
  return new CompanionRequestError(message, code, status, parseQuota(body.quota));
}

function parseProvenanceMeta(raw: Json | null): {
  provenance: CompanionProvenance | null;
  declined: boolean;
  boundaryLabel: string | null;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { provenance: null, declined: false, boundaryLabel: null };
  }
  const meta = raw as { sources?: unknown; declined?: unknown; boundaryLabel?: unknown };
  const sources = String(meta.sources ?? '');
  const provenance: CompanionProvenance | null =
    sources === 'your_notes' || sources === 'general_knowledge' || sources === 'mixed'
      ? sources
      : null;
  return {
    provenance,
    declined: meta.declined === true,
    boundaryLabel: typeof meta.boundaryLabel === 'string' ? meta.boundaryLabel : null,
  };
}

/** Pure: normalize a companion_messages row (or the function's echo of one). */
export function mapCompanionMessageRow(row: {
  id: number;
  role: string;
  feature: string;
  content: string;
  provenance: Json | null;
  created_at: string;
  salon_id?: string | null;
}): CompanionChatMessage {
  const meta = parseProvenanceMeta(row.provenance);
  return {
    id: row.id,
    role: row.role === 'reader' ? 'reader' : 'companion',
    feature: row.feature,
    content: row.content,
    createdAt: row.created_at,
    salonId: typeof row.salon_id === 'string' ? row.salon_id : null,
    ...meta,
  };
}

interface RawSendResponse {
  reply?: { content?: unknown; provenance?: unknown; declined?: unknown };
  boundaryLabel?: unknown;
  quota?: unknown;
  messages?: unknown;
  code?: unknown;
  suggestions?: unknown;
  results?: unknown;
  cards?: unknown;
  summaries?: unknown;
  stems?: unknown;
  observations?: unknown;
  mirror?: unknown;
  probe?: unknown;
  isConvergence?: unknown;
  insight?: unknown;
}

function normalizeSendResponse(data: RawSendResponse): CompanionSendResult {
  const provenanceRaw = String(data.reply?.provenance ?? '');
  const provenance: CompanionProvenance =
    provenanceRaw === 'general_knowledge' || provenanceRaw === 'mixed'
      ? provenanceRaw
      : 'your_notes';
  const rows = Array.isArray(data.messages) ? data.messages : [];
  const rawSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  return {
    reply: {
      content: String(data.reply?.content ?? ''),
      provenance,
      declined: data.reply?.declined === true,
    },
    boundaryLabel: typeof data.boundaryLabel === 'string' ? data.boundaryLabel : null,
    quota: parseQuota(data.quota),
    messages: rows.map((row) =>
      mapCompanionMessageRow(row as Parameters<typeof mapCompanionMessageRow>[0]),
    ),
    code: typeof data.code === 'string' ? data.code : null,
    suggestions: rawSuggestions
      .map((raw) => {
        const item = (raw ?? {}) as { entryId?: unknown; reason?: unknown };
        return { entryId: Number(item.entryId), reason: String(item.reason ?? '').trim() };
      })
      .filter((item) => Number.isFinite(item.entryId) && item.entryId > 0),
    results: (Array.isArray(data.results) ? data.results : [])
      .map((raw) => {
        const item = (raw ?? {}) as { entryId?: unknown; similarity?: unknown };
        return { entryId: Number(item.entryId), similarity: Number(item.similarity ?? 0) };
      })
      .filter((item) => Number.isFinite(item.entryId) && item.entryId > 0),
    cards: (Array.isArray(data.cards) ? data.cards : [])
      .map((raw) => {
        const item = (raw ?? {}) as { front?: unknown; back?: unknown };
        return { front: String(item.front ?? '').trim(), back: String(item.back ?? '').trim() };
      })
      .filter((item) => item.front.length > 0 && item.back.length > 0),
    summaries: (Array.isArray(data.summaries) ? data.summaries : [])
      .map((raw) => {
        const item = (raw ?? {}) as { entryId?: unknown; summary?: unknown };
        return { entryId: Number(item.entryId), summary: String(item.summary ?? '').trim() };
      })
      .filter((item) => Number.isFinite(item.entryId) && item.entryId > 0 && item.summary.length > 0),
    stems: (Array.isArray(data.stems) ? data.stems : [])
      .map((raw) => String(raw ?? '').trim())
      .filter((stem) => stem.length > 0)
      .slice(0, 3),
    observations: (Array.isArray(data.observations) ? data.observations : [])
      .map((raw) => {
        const item = (raw ?? {}) as { prompt?: unknown; stems?: unknown };
        return {
          prompt: String(item.prompt ?? '').trim(),
          stems: (Array.isArray(item.stems) ? item.stems : [])
            .map((s) => String(s ?? '').trim())
            .filter((s) => s.length > 0)
            .slice(0, 3),
        };
      })
      .filter((item) => item.prompt.length > 0)
      .slice(0, 3),
    mirror: typeof data.mirror === 'string' ? data.mirror.trim() : '',
    probe: typeof data.probe === 'string' ? data.probe.trim() : '',
    isConvergence: data.isConvergence === true,
    insight: typeof data.insight === 'string' ? data.insight.trim() : '',
  };
}

async function invokeCompanion(body: {
  feature:
    | 'dialogue'
    | 'recap'
    | CompanionToolFeature
    | 'structure_aid'
    | 'suggest_flags'
    | 'semantic_search'
    | 'entry_summaries'
    | 'observations'
    | 'observation_open'
    | 'insight';
  bookId: number;
  message?: string;
  detail?: string;
  startEntryId?: number;
  endEntryId?: number;
  rangeStart?: string;
  rangeEnd?: string;
  salonId?: string;
  turn?: number;
  insightText?: string;
}): Promise<CompanionSendResult> {
  const { data, error } = await supabase.functions.invoke('companion', { body });
  if (error) {
    // A non-2xx response arrives as a FunctionsHttpError whose context is
    // the raw Response; read its JSON body to recover the typed denial.
    const context = (error as { context?: unknown }).context;
    if (context && typeof (context as Response).json === 'function') {
      const response = context as Response;
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      throw companionErrorFromPayload(response.status, payload);
    }
    throw new CompanionRequestError(
      'The companion could not be reached. Check your connection and try again.',
      'NETWORK',
      0,
    );
  }
  return normalizeSendResponse((data ?? {}) as RawSendResponse);
}

export function sendCompanionMessage(
  bookId: number,
  message: string,
  salonId?: string,
  turn?: number,
): Promise<CompanionSendResult> {
  return invokeCompanion({ feature: 'dialogue', bookId, message: message.trim(), salonId, turn });
}

export function requestCompanionRecap(
  bookId: number,
  detail: RecapDetail,
): Promise<CompanionSendResult> {
  return invokeCompanion({ feature: 'recap', bookId, detail });
}

/**
 * Gold-bookmark story summary (D-055): retell the stretch between two of
 * the reader's bookmarks at the chosen level of detail.
 */
export function requestRangedRecap(
  bookId: number,
  startEntryId: number,
  endEntryId: number,
  detail: RecapDetail,
): Promise<CompanionSendResult> {
  return invokeCompanion({ feature: 'recap', bookId, detail, startEntryId, endEntryId });
}

/**
 * The Book Club primer (D-057): a max-3-bullet orientation drawn from the
 * reader's last few notes. Transient - regenerated per visit, never saved.
 */
export function requestClubPrimer(bookId: number): Promise<CompanionSendResult> {
  return invokeCompanion({ feature: 'club_prep', bookId });
}

/** The cue-card deck for a book, grounded only in the reader's own records. */
export function requestCueCards(bookId: number): Promise<CompanionSendResult> {
  return invokeCompanion({ feature: 'cue_cards', bookId });
}

/**
 * Refresh the one-line ribbon summaries for entries whose text changed
 * (D-055). Fire-and-forget: the ribbons fall back to the reader's own first
 * words until summaries land on the rows.
 */
export function refreshEntrySummaries(bookId: number): Promise<CompanionSendResult> {
  return invokeCompanion({ feature: 'entry_summaries', bookId });
}

/** Run a persisted companion tool; its result lands in the conversation. */
export function runCompanionTool(
  bookId: number,
  tool: CompanionToolFeature,
  level?: WordBankLevel,
): Promise<CompanionSendResult> {
  return invokeCompanion({
    feature: tool,
    bookId,
    ...(tool === 'word_bank' && level ? { detail: level } : {}),
  });
}

/** Transient: suggest a tidier arrangement of a draft (nothing is saved). */
export function requestStructureAid(bookId: number, draft: string): Promise<CompanionSendResult> {
  return invokeCompanion({ feature: 'structure_aid', bookId, message: draft.trim() });
}

/** Transient: which notes look like pivotal moments (nothing is saved). */
export function requestFlagSuggestions(bookId: number): Promise<CompanionSendResult> {
  return invokeCompanion({ feature: 'suggest_flags', bookId });
}

/** Search the reader's own notes by meaning; returns entry ids, best first. */
export function searchEntriesByMeaning(
  bookId: number,
  query: string,
): Promise<CompanionSendResult> {
  return invokeCompanion({ feature: 'semantic_search', bookId, message: query.trim() });
}

/**
 * Observation cards (D-056): 1-3 grounded conversation openers drawn from
 * the reader's own notes. Transient - nothing is saved until one is tapped.
 */
export function requestObservations(bookId: number): Promise<CompanionSendResult> {
  return invokeCompanion({ feature: 'observations', bookId });
}

/**
 * The reader tapped an observation card (D-056): persist it as the
 * companion's opener so the Socratic thread starts from it. No model call.
 */
export function openObservation(
  bookId: number,
  prompt: string,
  salonId?: string,
): Promise<CompanionSendResult> {
  return invokeCompanion({ feature: 'observation_open', bookId, message: prompt.trim(), salonId });
}

/**
 * Close a salon (D-058): distill the reader's answers in one session into a
 * short takeaway, persisted as the salon's 'insight' row. When the synthesis
 * card already crystallized the takeaway (D-059), pass it as insightText so
 * it is saved verbatim without a second model call.
 */
export function requestSalonInsight(
  bookId: number,
  salonId: string,
  insightText?: string,
): Promise<CompanionSendResult> {
  return invokeCompanion({
    feature: 'insight',
    bookId,
    salonId,
    ...(insightText && insightText.trim() ? { insightText: insightText.trim() } : {}),
  });
}

const MESSAGE_PAGE_SIZE = 200;

/** The stored conversation for a book, oldest first (RLS scopes to owner). */
export async function fetchCompanionMessages(bookId: number): Promise<CompanionChatMessage[]> {
  const { data, error } = await supabase
    .from('companion_messages')
    .select('id, role, feature, content, provenance, created_at, salon_id')
    .eq('topic_id', bookId)
    .neq('feature', 'recap')
    .order('created_at', { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  if (error) {
    throw error;
  }
  return (data ?? []).reverse().map(mapCompanionMessageRow);
}

/** The most recent stored recap for a book, if one exists. */
export async function fetchLatestCompanionRecap(
  bookId: number,
): Promise<CompanionChatMessage | null> {
  const { data, error } = await supabase
    .from('companion_messages')
    .select('id, role, feature, content, provenance, created_at')
    .eq('topic_id', bookId)
    .eq('feature', 'recap')
    .eq('role', 'companion')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data ? mapCompanionMessageRow(data) : null;
}
