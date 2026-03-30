// Patterns for internship/co-op type detection
const INTERN_PATTERN = /\bintern(ship)?\b/i;
const COOP_PATTERN = /\bco-?op\b/i;

// Patterns for relevant SWE/MLE/AI roles
const ROLE_PATTERN =
  /\b(software|engineer|engineering|developer|ml|machine learning|artificial intelligence|ai|data|research|scientist)\b/i;

export type JobType = 'internship' | 'coop';

export function getJobType(title: string): JobType | null {
  if (COOP_PATTERN.test(title)) return 'coop';
  if (INTERN_PATTERN.test(title)) return 'internship';
  return null;
}

export function isRelevantRole(title: string, team?: string): boolean {
  return ROLE_PATTERN.test(title) || (!!team && ROLE_PATTERN.test(team));
}

// Returns true if the timestamp is within the last 24 hours.
// If timestamp is null/undefined, returns true (include by default).
export function isWithin24Hours(timestamp: string | number | null | undefined): boolean {
  if (timestamp == null) return true;
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
  if (isNaN(date.getTime())) return true;
  const diffMs = Date.now() - date.getTime();
  return diffMs <= 24 * 60 * 60 * 1000;
}
