import { requireUserId } from '@/domains/auth/service';
import type { Json, Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type IssueReport = Tables<'issue_reports'>;
export type SpoilerReport = Tables<'spoiler_reports'>;
export type IssueKind = 'bug' | 'content' | 'other';

export const REPORT_STATUS_LABELS: Record<string, string> = {
  new: 'Received',
  triaged: 'Triaged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  dismissed: 'Closed',
};

export async function submitIssueReport(input: {
  kind: IssueKind;
  description: string;
  topicId?: number | null;
  context?: { [key: string]: Json | undefined };
}): Promise<IssueReport> {
  const description = input.description.trim();
  if (!description) {
    throw new Error('Describe the issue first.');
  }
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('issue_reports')
    .insert({
      user_id: userId,
      topic_id: input.topicId ?? null,
      kind: input.kind,
      description,
      context: input.context ?? {},
    })
    .select()
    .single();
  if (error) {
    throw error;
  }
  return data;
}

export async function listMyIssueReports(): Promise<IssueReport[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('issue_reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return data ?? [];
}

/**
 * Spoiler reports carry the PWA shape (boundary label + excerpt + reason).
 * No UI entry point exists while the app is capture-only; the reading
 * companion (Stage 3+) reattaches this to generated content.
 */
export async function submitSpoilerReport(input: {
  topicId: number;
  reason: string;
  boundaryLabel?: string | null;
  summaryExcerpt?: string | null;
  auditId?: string | null;
}): Promise<SpoilerReport> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error('Describe the spoiler first.');
  }
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('spoiler_reports')
    .insert({
      user_id: userId,
      topic_id: input.topicId,
      reason,
      boundary_label: input.boundaryLabel ?? null,
      summary_excerpt: input.summaryExcerpt ?? null,
      audit_id: input.auditId ?? null,
    })
    .select()
    .single();
  if (error) {
    throw error;
  }
  return data;
}
