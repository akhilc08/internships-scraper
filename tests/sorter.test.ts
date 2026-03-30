import { parseCSVLine, classifyByKeyword } from '../src/sorter';
import { JobListing } from '../src/types';

function makeListing(overrides: Partial<JobListing> = {}): JobListing {
  return {
    company: 'Acme',
    title: 'Software Engineer Intern',
    description: '',
    location: 'Remote',
    applicationLink: 'https://example.com',
    source: 'test',
    scrapedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── parseCSVLine ───────────────────────────────────────────────────────────────

describe('parseCSVLine', () => {
  test('parses simple unquoted fields', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  test('parses quoted fields', () => {
    expect(parseCSVLine('"hello","world"')).toEqual(['hello', 'world']);
  });

  test('parses field with embedded comma inside quotes', () => {
    expect(parseCSVLine('"San Francisco, CA",Engineer')).toEqual(['San Francisco, CA', 'Engineer']);
  });

  test('parses escaped double-quotes inside quoted field', () => {
    expect(parseCSVLine('"say ""hello""",world')).toEqual(['say "hello"', 'world']);
  });

  test('parses empty fields', () => {
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
  });

  test('handles single field', () => {
    expect(parseCSVLine('only')).toEqual(['only']);
  });

  test('handles all-empty line', () => {
    expect(parseCSVLine('')).toEqual(['']);
  });

  test('parses seven CSV columns (full job listing row)', () => {
    const line = 'Acme Corp,"Software Engineer, Intern","Great role","Remote","https://example.com","test","2026-01-01T00:00:00.000Z"';
    const fields = parseCSVLine(line);
    expect(fields).toHaveLength(7);
    expect(fields[0]).toBe('Acme Corp');
    expect(fields[1]).toBe('Software Engineer, Intern');
    expect(fields[4]).toBe('https://example.com');
  });

  test('handles URL with no quotes', () => {
    const line = 'Co,Title,Desc,Loc,https://boards.greenhouse.io/co/jobs/123,Source,2026-01-01';
    const fields = parseCSVLine(line);
    expect(fields[4]).toBe('https://boards.greenhouse.io/co/jobs/123');
  });

  test('multiline description (quoted with newline) — stays in one field', () => {
    const line = '"Acme","Title","Line1\\nLine2","Remote","https://example.com","src","2026-01-01"';
    const fields = parseCSVLine(line);
    expect(fields).toHaveLength(7);
  });
});

// ── classifyByKeyword ─────────────────────────────────────────────────────────

describe('classifyByKeyword - TOP_COMPANY', () => {
  const topCompanies = [
    'Google', 'Meta', 'Apple', 'Amazon', 'Microsoft', 'Netflix', 'Uber',
    'Lyft', 'Airbnb', 'LinkedIn', 'Salesforce', 'Adobe', 'Intel', 'AMD',
    'Nvidia', 'Qualcomm', 'Cisco', 'Oracle', 'Palantir', 'Snowflake',
    'Databricks', 'Cloudflare', 'OpenAI', 'Anthropic', 'DeepMind',
    'Cohere', 'Mistral', 'Stripe', 'Figma', 'Notion', 'Ramp', 'Linear',
    'Replit', 'Modal', 'Confluent', 'Datadog', 'Brex', 'Plaid', 'Rippling',
    'Airtable', 'Canva', 'Retool', 'Anduril', 'SpaceX', 'Waymo',
  ];

  for (const company of topCompanies) {
    test(`"${company}" → TOP_COMPANY`, () => {
      expect(classifyByKeyword(makeListing({ company }))).toBe('TOP_COMPANY');
    });
  }

  test('Jane Street → TOP_COMPANY (multi-word)', () => {
    expect(classifyByKeyword(makeListing({ company: 'Jane Street' }))).toBe('TOP_COMPANY');
  });

  test('Two Sigma → TOP_COMPANY', () => {
    expect(classifyByKeyword(makeListing({ company: 'Two Sigma' }))).toBe('TOP_COMPANY');
  });

  test('case-insensitive: "GOOGLE" → TOP_COMPANY', () => {
    expect(classifyByKeyword(makeListing({ company: 'GOOGLE' }))).toBe('TOP_COMPANY');
  });

  test('partial match: "Google LLC" → TOP_COMPANY', () => {
    expect(classifyByKeyword(makeListing({ company: 'Google LLC' }))).toBe('TOP_COMPANY');
  });
});

describe('classifyByKeyword - MLE', () => {
  const mleTitles = [
    'Machine Learning Engineer Intern',
    'Data Science Intern',
    'Data Scientist Intern',
    'ML Engineer Co-op',
    'AI Research Intern',
    'NLP Intern',
    'Computer Vision Intern',
    'Research Scientist Intern',
    'Applied Scientist Intern',
    'Data Analyst Intern',
    'Deep Learning Intern',
    'Reinforcement Learning Intern',
    'LLM Research Intern',
    'Generative AI Intern',
  ];

  for (const title of mleTitles) {
    test(`"${title}" → MLE (non-top-company)`, () => {
      const listing = makeListing({ company: 'Unknown Startup', title });
      expect(classifyByKeyword(listing)).toBe('MLE');
    });
  }

  test('top company with MLE title still → TOP_COMPANY', () => {
    const listing = makeListing({ company: 'Google', title: 'Machine Learning Intern' });
    expect(classifyByKeyword(listing)).toBe('TOP_COMPANY');
  });
});

describe('classifyByKeyword - SWE fallback', () => {
  test('generic software title → SWE', () => {
    expect(classifyByKeyword(makeListing({ company: 'Unknown Co', title: 'Software Engineer Intern' }))).toBe('SWE');
  });

  test('frontend developer → SWE', () => {
    expect(classifyByKeyword(makeListing({ company: 'Unknown Co', title: 'Frontend Developer Intern' }))).toBe('SWE');
  });

  test('unrecognized company + unrecognized title → SWE (default fallback)', () => {
    expect(classifyByKeyword(makeListing({ company: 'Unknown Corp', title: 'Product Intern' }))).toBe('SWE');
  });
});
