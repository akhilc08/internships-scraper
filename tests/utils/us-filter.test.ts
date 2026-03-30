import { isUSLocation } from '../../src/utils/us-filter';

describe('isUSLocation', () => {
  // ── Empty / falsy ──────────────────────────────────────────────────────────
  test('empty string → false', () => expect(isUSLocation('')).toBe(false));

  // ── Bare "Remote" ──────────────────────────────────────────────────────────
  test('"Remote" → true', () => expect(isUSLocation('Remote')).toBe(true));
  test('"remote" (lowercase) → true', () => expect(isUSLocation('remote')).toBe(true));
  test('"REMOTE" (uppercase) → true', () => expect(isUSLocation('REMOTE')).toBe(true));
  test('"Remote " (trailing space) → true', () => expect(isUSLocation('Remote ')).toBe(true));

  // ── Remote with US qualifier ───────────────────────────────────────────────
  test('"Remote, US" → true', () => expect(isUSLocation('Remote, US')).toBe(true));
  test('"Remote, USA" → true', () => expect(isUSLocation('Remote, USA')).toBe(true));
  test('"Remote - United States" → true', () => expect(isUSLocation('Remote - United States')).toBe(true));
  test('"Remote (United States)" → true', () => expect(isUSLocation('Remote (United States)')).toBe(true));

  // ── Remote with non-US qualifier should NOT match the bare-remote rule ─────
  // (only "Remote" alone matches /^remote$/i — these have extra text)
  test('"Remote, Canada" → false', () => expect(isUSLocation('Remote, Canada')).toBe(false));
  test('"Remote - UK" → false', () => expect(isUSLocation('Remote - UK')).toBe(false));

  // ── "City, ST" patterns ────────────────────────────────────────────────────
  test('"San Francisco, CA" → true', () => expect(isUSLocation('San Francisco, CA')).toBe(true));
  test('"New York, NY" → true', () => expect(isUSLocation('New York, NY')).toBe(true));
  test('"Austin, TX" → true', () => expect(isUSLocation('Austin, TX')).toBe(true));
  test('"Seattle, WA, USA" → true', () => expect(isUSLocation('Seattle, WA, USA')).toBe(true));
  test('"Washington, DC" → true', () => expect(isUSLocation('Washington, DC')).toBe(true));

  // ── Non-US two-letter codes ────────────────────────────────────────────────
  test('"Toronto, ON" → false (ON is not a US state)', () => expect(isUSLocation('Toronto, ON')).toBe(false));
  test('"London, UK" → false', () => expect(isUSLocation('London, UK')).toBe(false));
  // "DE" is Delaware — so "Berlin, DE" is actually treated as US by the regex
  test('"Berlin, DE" → true (DE = Delaware)', () => expect(isUSLocation('Berlin, DE')).toBe(true));
  // Use a clearly non-US two-letter code that is not a state abbreviation
  test('"Munich, BY" → false (BY is not a US state)', () => expect(isUSLocation('Munich, BY')).toBe(false));
  test('"Tokyo, JP" → false (JP is not a US state)', () => expect(isUSLocation('Tokyo, JP')).toBe(false));

  // ── Explicit US labels ─────────────────────────────────────────────────────
  test('"United States" → true', () => expect(isUSLocation('United States')).toBe(true));
  test('"USA" → true', () => expect(isUSLocation('USA')).toBe(true));
  test('"U.S.A." → true', () => expect(isUSLocation('U.S.A.')).toBe(true));
  test('"U.S." → true', () => expect(isUSLocation('U.S.')).toBe(true));
  test('"Austin, U.S.A." → true', () => expect(isUSLocation('Austin, U.S.A.')).toBe(true));
  test('"Menlo Park, United States" → true', () => expect(isUSLocation('Menlo Park, United States')).toBe(true));

  // ── Multiple Locations ────────────────────────────────────────────────────
  test('"Multiple Locations" → true', () => expect(isUSLocation('Multiple Locations')).toBe(true));
  test('"multiple locations" → true', () => expect(isUSLocation('multiple locations')).toBe(true));

  // ── Clearly foreign ──────────────────────────────────────────────────────
  test('"Paris, France" → false', () => expect(isUSLocation('Paris, France')).toBe(false));
  test('"Tokyo, Japan" → false', () => expect(isUSLocation('Tokyo, Japan')).toBe(false));
  test('"Singapore" → false', () => expect(isUSLocation('Singapore')).toBe(false));

  // ── Edge: all 50 state abbreviations spot-check ───────────────────────────
  const spotStates = ['AL', 'CA', 'FL', 'NY', 'TX', 'WA', 'WY', 'HI', 'AK'];
  for (const st of spotStates) {
    test(`"City, ${st}" → true`, () => expect(isUSLocation(`City, ${st}`)).toBe(true));
  }
});
