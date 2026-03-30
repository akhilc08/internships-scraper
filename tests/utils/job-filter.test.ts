import { getJobType, isRelevantRole, isWithin24Hours } from '../../src/utils/job-filter';

// ── getJobType ─────────────────────────────────────────────────────────────────

describe('getJobType', () => {
  test('detects "intern" → internship', () => expect(getJobType('Software Engineer Intern')).toBe('internship'));
  test('detects "internship" → internship', () => expect(getJobType('Software Engineering Internship')).toBe('internship'));
  test('detects "Intern" case-insensitive → internship', () => expect(getJobType('Data INTERN')).toBe('internship'));

  test('detects "co-op" → coop', () => expect(getJobType('Software Engineer Co-op')).toBe('coop'));
  test('detects "coop" → coop', () => expect(getJobType('Data Engineering Coop')).toBe('coop'));
  test('detects "COOP" uppercase → coop', () => expect(getJobType('ML COOP Engineer')).toBe('coop'));

  // co-op takes priority over intern when both appear
  test('coop wins when both keywords present', () => expect(getJobType('Co-op Intern Program')).toBe('coop'));

  test('no match → null', () => expect(getJobType('Software Engineer')).toBeNull());
  test('product manager → null', () => expect(getJobType('Product Manager')).toBeNull());
  test('empty string → null', () => expect(getJobType('')).toBeNull());

  // edge: "internal" should NOT match (requires word boundary)
  test('"internal" does not match intern', () => expect(getJobType('internal tools')).toBeNull());
});

// ── isRelevantRole ─────────────────────────────────────────────────────────────

describe('isRelevantRole', () => {
  // title matches
  test('software → true', () => expect(isRelevantRole('Software Engineer Intern')).toBe(true));
  test('engineer → true', () => expect(isRelevantRole('Engineer Intern')).toBe(true));
  test('developer → true', () => expect(isRelevantRole('Frontend Developer Intern')).toBe(true));
  test('ml → true', () => expect(isRelevantRole('ML Engineer Intern')).toBe(true));
  test('machine learning → true', () => expect(isRelevantRole('Machine Learning Intern')).toBe(true));
  test('data → true', () => expect(isRelevantRole('Data Analyst Intern')).toBe(true));
  test('research → true', () => expect(isRelevantRole('Research Scientist Intern')).toBe(true));
  test('scientist → true', () => expect(isRelevantRole('Scientist Intern')).toBe(true));
  test('ai → true', () => expect(isRelevantRole('AI Intern')).toBe(true));
  test('artificial intelligence → true', () => expect(isRelevantRole('Artificial Intelligence Intern')).toBe(true));
  test('engineering → true', () => expect(isRelevantRole('Engineering Intern')).toBe(true));

  // not relevant
  test('marketing intern → false', () => expect(isRelevantRole('Marketing Intern')).toBe(false));
  test('design intern → false', () => expect(isRelevantRole('Design Intern')).toBe(false));
  test('finance intern → false', () => expect(isRelevantRole('Finance Intern')).toBe(false));
  test('empty title → false', () => expect(isRelevantRole('')).toBe(false));

  // team/department fallback
  test('unrelated title but engineering team → true', () =>
    expect(isRelevantRole('Intern', 'Engineering')).toBe(true));
  test('unrelated title and unrelated team → false', () =>
    expect(isRelevantRole('Intern', 'Marketing')).toBe(false));
  test('unrelated title with no team → false', () =>
    expect(isRelevantRole('Intern', undefined)).toBe(false));
  test('unrelated title with empty team → false', () =>
    expect(isRelevantRole('Intern', '')).toBe(false));
});

// ── isWithin24Hours ────────────────────────────────────────────────────────────

describe('isWithin24Hours', () => {
  test('null → true (include by default)', () => expect(isWithin24Hours(null)).toBe(true));
  test('undefined → true', () => expect(isWithin24Hours(undefined)).toBe(true));
  test('invalid date string → true', () => expect(isWithin24Hours('not-a-date')).toBe(true));

  test('timestamp 1 second ago → true', () =>
    expect(isWithin24Hours(Date.now() - 1_000)).toBe(true));
  test('timestamp 1 hour ago → true', () =>
    expect(isWithin24Hours(Date.now() - 60 * 60 * 1_000)).toBe(true));
  test('timestamp 23 hours ago → true', () =>
    expect(isWithin24Hours(Date.now() - 23 * 60 * 60 * 1_000)).toBe(true));
  test('timestamp exactly now → true', () =>
    expect(isWithin24Hours(Date.now())).toBe(true));

  test('timestamp 25 hours ago → false', () =>
    expect(isWithin24Hours(Date.now() - 25 * 60 * 60 * 1_000)).toBe(false));
  test('timestamp 48 hours ago → false', () =>
    expect(isWithin24Hours(Date.now() - 48 * 60 * 60 * 1_000)).toBe(false));
  test('timestamp 7 days ago → false', () =>
    expect(isWithin24Hours(Date.now() - 7 * 24 * 60 * 60 * 1_000)).toBe(false));

  // ISO string variants
  test('ISO string 1 hour ago → true', () =>
    expect(isWithin24Hours(new Date(Date.now() - 60 * 60 * 1_000).toISOString())).toBe(true));
  test('ISO string 25 hours ago → false', () =>
    expect(isWithin24Hours(new Date(Date.now() - 25 * 60 * 60 * 1_000).toISOString())).toBe(false));
});
