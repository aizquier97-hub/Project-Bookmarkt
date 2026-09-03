import type { CompanionChatMessage } from './api';

/** One bounded Book Club discussion (D-058), grouped from stored messages. */
export interface Salon {
  id: string;
  startedAt: string;
  lastAt: string;
  /** The distilled takeaway, if the reader closed the salon. */
  insight: string | null;
  /** Companion probe -> reader answer, oldest first (the archive's index cards). */
  pairs: { question: string | null; answer: string | null }[];
  /** The last companion probe - the active card when a salon is resumed. */
  lastProbe: string | null;
}

const SALON_FEATURES = new Set(['dialogue', 'observation', 'insight']);

/**
 * Group stored companion messages into salons, newest first. Rows without a
 * salon (legacy chat history, persisted tool results) stay out of the archive.
 * Expects messages oldest first, as fetchCompanionMessages returns them.
 */
export function buildSalons(messages: CompanionChatMessage[]): Salon[] {
  const bySalon = new Map<string, CompanionChatMessage[]>();
  for (const message of messages) {
    if (!message.salonId || !SALON_FEATURES.has(message.feature)) {
      continue;
    }
    const rows = bySalon.get(message.salonId);
    if (rows) {
      rows.push(message);
    } else {
      bySalon.set(message.salonId, [message]);
    }
  }
  const salons = [...bySalon.entries()].map(([id, rows]) => {
    const pairs: Salon['pairs'] = [];
    let openQuestion: string | null = null;
    let insight: string | null = null;
    let lastProbe: string | null = null;
    for (const row of rows) {
      if (row.feature === 'insight') {
        insight = row.content;
        continue;
      }
      if (row.role === 'companion') {
        if (openQuestion) {
          pairs.push({ question: openQuestion, answer: null });
        }
        openQuestion = row.content;
        lastProbe = row.content;
      } else {
        pairs.push({ question: openQuestion, answer: row.content });
        openQuestion = null;
      }
    }
    if (openQuestion) {
      pairs.push({ question: openQuestion, answer: null });
    }
    return {
      id,
      startedAt: rows[0].createdAt,
      lastAt: rows[rows.length - 1].createdAt,
      insight,
      pairs,
      lastProbe,
    };
  });
  salons.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return salons;
}

/** Short date label for the archive ("Sep 5"). */
export function formatSalonDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
