// Character description encoding ported verbatim from the PWA ("Role:"/
// "Description:"/"Relationships:" lines) so both clients read each other's
// records. Pure module — no Supabase dependency — so the format is testable.

export interface CharacterDetails {
  role: string;
  description: string;
  relationships: string;
}

export function mergeCharacterDescription(details: CharacterDetails): string {
  const parts: string[] = [];
  if (details.role) parts.push(`Role: ${details.role}`);
  if (details.description) parts.push(`Description: ${details.description}`);
  if (details.relationships) parts.push(`Relationships: ${details.relationships}`);
  return parts.join('\n');
}

export function parseCharacterDescription(description: string | null | undefined): CharacterDetails {
  const parsed: CharacterDetails = { role: '', description: '', relationships: '' };
  const text = description ?? '';
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('Role:')) {
      parsed.role = line.substring(5).trim();
    } else if (line.startsWith('Description:')) {
      parsed.description = line.substring(12).trim();
    } else if (line.startsWith('Relationships:')) {
      parsed.relationships = line.substring(14).trim();
    }
  }
  if (!parsed.role && !parsed.description && !parsed.relationships) {
    parsed.description = text.trim();
  }
  return parsed;
}
