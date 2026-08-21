// Progress-boundary rules ported verbatim from the PWA so entry text stays
// byte-compatible across clients ("[Manual Entry - page 12-15]" headers).

export type ProgressType = 'page' | 'chapter';

export interface ProgressBoundary {
  progressType: ProgressType;
  lower: number | null;
  upper: number;
}

export function normalizeProgressType(value: string | null | undefined): ProgressType {
  return value === 'chapter' ? 'chapter' : 'page';
}

export function normalizeProgressNumber(value: string | number | null | undefined): number | null {
  const parsed = Number(String(value ?? '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

export function buildProgressRangeLabel(
  progressType: ProgressType,
  lowerValue: number | null,
  upperValue: number,
): string {
  const type = normalizeProgressType(progressType);
  if (lowerValue !== null && Number.isFinite(lowerValue) && lowerValue > 0) {
    const windowStart = Math.min(Math.floor(lowerValue) + 1, upperValue);
    if (windowStart >= upperValue) {
      return `${type} ${upperValue}`;
    }
    return `${type} ${windowStart}-${upperValue}`;
  }
  return `${type} ${upperValue}`;
}

export function parseProgressBoundaryFromEntryText(
  text: string | null | undefined,
): ProgressBoundary | null {
  const firstLine = String(text ?? '').split('\n')[0] ?? '';
  const match = firstLine.match(/\b(page|chapter)\s+(\d+)(?:\s*-\s*(\d+))?\b/i);
  if (!match) {
    return null;
  }
  const progressType = normalizeProgressType(match[1].toLowerCase());
  const firstValue = Number(match[2]);
  const secondValue = match[3] ? Number(match[3]) : null;
  if (!Number.isFinite(firstValue) || firstValue <= 0) {
    return null;
  }
  if (secondValue !== null) {
    if (!Number.isFinite(secondValue) || secondValue <= 0) {
      return null;
    }
    return {
      progressType,
      lower: Math.min(firstValue, secondValue),
      upper: Math.max(firstValue, secondValue),
    };
  }
  return { progressType, lower: null, upper: firstValue };
}

export function getLatestProgressBoundary(
  entryTexts: { text: string | null }[],
  progressType: ProgressType,
): ProgressBoundary | null {
  const wantedType = normalizeProgressType(progressType);
  for (const entry of entryTexts) {
    const parsed = parseProgressBoundaryFromEntryText(entry?.text);
    if (!parsed) {
      continue;
    }
    if (parsed.progressType !== wantedType) {
      continue;
    }
    return parsed;
  }
  return null;
}
