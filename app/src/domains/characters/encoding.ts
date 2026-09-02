// Character description encoding ported from the PWA ("Role:"/
// "Description:"/"Relationships:" lines) so both clients read each other's
// records. "First noted:" is a native-app addition (D-045) carrying the
// reading position when the character was first captured; the PWA parser
// ignores the line. Pure module — no Supabase dependency.

export interface CharacterDetails {
  role: string;
  description: string;
  relationships: string;
  /** Reading position when first captured, e.g. "page 124" ('' when unknown). */
  firstNoted?: string;
}

export function mergeCharacterDescription(details: CharacterDetails): string {
  const parts: string[] = [];
  if (details.role) parts.push(`Role: ${details.role}`);
  if (details.description) parts.push(`Description: ${details.description}`);
  if (details.relationships) parts.push(`Relationships: ${details.relationships}`);
  if (details.firstNoted) parts.push(`First noted: ${details.firstNoted}`);
  return parts.join('\n');
}

export function parseCharacterDescription(description: string | null | undefined): CharacterDetails {
  const parsed: CharacterDetails = { role: '', description: '', relationships: '', firstNoted: '' };
  const text = description ?? '';
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  let matched = false;
  for (const line of lines) {
    if (line.startsWith('Role:')) {
      parsed.role = line.substring(5).trim();
      matched = true;
    } else if (line.startsWith('Description:')) {
      parsed.description = line.substring(12).trim();
      matched = true;
    } else if (line.startsWith('Relationships:')) {
      parsed.relationships = line.substring(14).trim();
      matched = true;
    } else if (line.startsWith('First noted:')) {
      parsed.firstNoted = line.substring(12).trim();
      matched = true;
    }
  }
  if (!matched) {
    parsed.description = text.trim();
  }
  return parsed;
}
