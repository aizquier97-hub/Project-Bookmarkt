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
  /** Set for the recap empty-notes case (code NO_ENTRIES). */
  code: string | null;
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
}): CompanionChatMessage {
  const meta = parseProvenanceMeta(row.provenance);
  return {
    id: row.id,
    role: row.role === 'reader' ? 'reader' : 'companion',
    feature: row.feature,
    content: row.content,
    createdAt: row.created_at,
    ...meta,
  };
}

interface RawSendResponse {
  reply?: { content?: unknown; provenance?: unknown; declined?: unknown };
  boundaryLabel?: unknown;
  quota?: unknown;
  messages?: unknown;
  code?: unknown;
}

function normalizeSendResponse(data: RawSendResponse): CompanionSendResult {
  const provenanceRaw = String(data.reply?.provenance ?? '');
  const provenance: CompanionProvenance =
    provenanceRaw === 'general_knowledge' || provenanceRaw === 'mixed'
      ? provenanceRaw
      : 'your_notes';
  const rows = Array.isArray(data.messages) ? data.messages : [];
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
  };
}

async function invokeCompanion(body: {
  feature: 'dialogue' | 'recap';
  bookId: number;
  message?: string;
  detail?: 'brief' | 'detailed';
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

export function sendCompanionMessage(bookId: number, message: string): Promise<CompanionSendResult> {
  return invokeCompanion({ feature: 'dialogue', bookId, message: message.trim() });
}

export function requestCompanionRecap(
  bookId: number,
  detail: 'brief' | 'detailed',
): Promise<CompanionSendResult> {
  return invokeCompanion({ feature: 'recap', bookId, detail });
}

const MESSAGE_PAGE_SIZE = 200;

/** The stored conversation for a book, oldest first (RLS scopes to owner). */
export async function fetchCompanionMessages(bookId: number): Promise<CompanionChatMessage[]> {
  const { data, error } = await supabase
    .from('companion_messages')
    .select('id, role, feature, content, provenance, created_at')
    .eq('topic_id', bookId)
    .order('created_at', { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  if (error) {
    throw error;
  }
  return (data ?? []).reverse().map(mapCompanionMessageRow);
}
