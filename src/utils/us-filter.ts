const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
]);

// "Remote" without a non-US qualifier is treated as US (these lists are US-focused).
export function isUSLocation(location: string): boolean {
  if (!location) return false;

  const loc = location.trim();

  if (/^remote$/i.test(loc)) return true;

  // "Remote, US" / "Remote - United States" etc.
  if (/\bremote\b/i.test(loc) && /\b(US|USA|United States)\b/i.test(loc)) return true;

  // "City, ST" or "City, ST, USA" — last two-letter segment is a US state
  const stateMatch = loc.match(/,\s*([A-Z]{2})(?:\s*,|\s*$)/);
  if (stateMatch && US_STATES.has(stateMatch[1])) return true;

  // Explicit US label
  if (/\b(United States|USA)\b/i.test(loc) || /\bU\.S\.A?\.?(?:\s|,|$)/i.test(loc)) return true;

  // Multiple locations — include; individual entries will be US if the repo is US-focused
  if (/multiple locations/i.test(loc)) return true;

  return false;
}
