import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeListings } from '../src/writer';
import { JobListing } from '../src/types';

function makeListing(overrides: Partial<JobListing> = {}): JobListing {
  return {
    company: 'Acme Corp',
    title: 'Software Engineer Intern',
    description: 'A great role',
    location: 'San Francisco, CA',
    applicationLink: 'https://example.com/apply',
    source: 'test',
    scrapedAt: new Date().toISOString(),
    ...overrides,
  };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'internship-writer-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Basic write ────────────────────────────────────────────────────────────────

test('writes new listings and returns correct counts', async () => {
  const csvPath = path.join(tmpDir, 'internships_2026-03-29.csv');
  const listings = [makeListing(), makeListing({ company: 'BetaCo', applicationLink: 'https://betaco.com/apply' })];

  const result = await writeListings(csvPath, listings);

  expect(result.added).toBe(2);
  expect(result.skipped).toBe(0);
  expect(fs.existsSync(csvPath)).toBe(true);
});

test('empty listings returns 0 added, 0 skipped, no CSV created', async () => {
  const csvPath = path.join(tmpDir, 'internships_2026-03-29.csv');

  const result = await writeListings(csvPath, []);

  expect(result.added).toBe(0);
  expect(result.skipped).toBe(0);
  expect(fs.existsSync(csvPath)).toBe(false);
});

// ── Deduplication by URL ───────────────────────────────────────────────────────

test('deduplicates by exact URL on second call', async () => {
  const csvPath = path.join(tmpDir, 'internships_2026-03-29.csv');
  const listing = makeListing();

  await writeListings(csvPath, [listing]);
  const result2 = await writeListings(csvPath, [listing]);

  expect(result2.added).toBe(0);
  expect(result2.skipped).toBe(1);
});

test('deduplicates tracking params from URLs', async () => {
  const csvPath = path.join(tmpDir, 'internships_2026-03-29.csv');
  const base = 'https://example.com/apply';

  const first = makeListing({ applicationLink: `${base}?utm_source=linkedin&utm_medium=social` });
  const second = makeListing({ applicationLink: `${base}?utm_source=twitter&gh_src=abc` });

  await writeListings(csvPath, [first]);
  const result = await writeListings(csvPath, [second]);

  // Same URL after stripping tracking params → duplicate
  expect(result.added).toBe(0);
  expect(result.skipped).toBe(1);
});

test('gh_src and ref params are stripped', async () => {
  const csvPath = path.join(tmpDir, 'internships_2026-03-29.csv');
  const base = 'https://boards.greenhouse.io/acme/jobs/123';

  const first = makeListing({ applicationLink: `${base}?gh_src=simplify` });
  const second = makeListing({ applicationLink: `${base}?ref=pittcsc` });

  await writeListings(csvPath, [first]);
  const result = await writeListings(csvPath, [second]);

  expect(result.added).toBe(0);
  expect(result.skipped).toBe(1);
});

// ── Deduplication by semantic key ─────────────────────────────────────────────

test('deduplicates same company+title from different sources (semantic key)', async () => {
  const csvPath = path.join(tmpDir, 'internships_2026-03-29.csv');

  const fromSimplify = makeListing({
    applicationLink: 'https://simplify.jobs/p/abc123',
    source: 'SimplifyJobs',
  });
  const fromPittCSC = makeListing({
    applicationLink: 'https://pittcsc.org/jobs/abc999',
    source: 'pittcsc',
  });

  await writeListings(csvPath, [fromSimplify]);
  const result = await writeListings(csvPath, [fromPittCSC]);

  // Same company+title → semantic duplicate
  expect(result.added).toBe(0);
  expect(result.skipped).toBe(1);
});

test('different company same title → not a duplicate', async () => {
  const csvPath = path.join(tmpDir, 'internships_2026-03-29.csv');

  const a = makeListing({ company: 'Alpha Inc', applicationLink: 'https://alpha.com/apply' });
  const b = makeListing({ company: 'Beta Inc', applicationLink: 'https://beta.com/apply' });

  await writeListings(csvPath, [a]);
  const result = await writeListings(csvPath, [b]);

  expect(result.added).toBe(1);
  expect(result.skipped).toBe(0);
});

test('same company different title → not a duplicate', async () => {
  const csvPath = path.join(tmpDir, 'internships_2026-03-29.csv');

  const a = makeListing({ title: 'Software Engineer Intern', applicationLink: 'https://acme.com/swe' });
  const b = makeListing({ title: 'Data Engineer Intern', applicationLink: 'https://acme.com/de' });

  await writeListings(csvPath, [a]);
  const result = await writeListings(csvPath, [b]);

  expect(result.added).toBe(1);
  expect(result.skipped).toBe(0);
});

// ── Seen store persistence across dated CSV names ─────────────────────────────

test('seen store is shared across different date-stamped CSVs for the same category', async () => {
  const csv1 = path.join(tmpDir, 'internships_2026-03-28.csv');
  const csv2 = path.join(tmpDir, 'internships_2026-03-29.csv');
  const listing = makeListing();

  await writeListings(csv1, [listing]);

  // Seen file strips the date — same store
  const result = await writeListings(csv2, [listing]);

  expect(result.added).toBe(0);
  expect(result.skipped).toBe(1);
});

// ── Appending ─────────────────────────────────────────────────────────────────

test('appends to existing CSV on subsequent calls', async () => {
  const csvPath = path.join(tmpDir, 'internships_2026-03-29.csv');

  const a = makeListing({ applicationLink: 'https://a.com' });
  const b = makeListing({ company: 'BetaCo', applicationLink: 'https://b.com' });

  await writeListings(csvPath, [a]);
  await writeListings(csvPath, [b]);

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());
  // 1 header + 2 rows
  expect(lines).toHaveLength(3);
});

// ── Mixed new and duplicate ────────────────────────────────────────────────────

test('correctly separates new from duplicates in the same batch', async () => {
  const csvPath = path.join(tmpDir, 'internships_2026-03-29.csv');

  const old = makeListing({ applicationLink: 'https://old.com' });
  await writeListings(csvPath, [old]);

  const fresh = makeListing({ company: 'New Inc', applicationLink: 'https://new.com' });
  const result = await writeListings(csvPath, [old, fresh]);

  expect(result.added).toBe(1);
  expect(result.skipped).toBe(1);
});

// ── Invalid URL handling ───────────────────────────────────────────────────────

test('handles malformed URLs gracefully (no crash)', async () => {
  const csvPath = path.join(tmpDir, 'internships_2026-03-29.csv');
  const listing = makeListing({ applicationLink: 'not-a-valid-url' });

  const result = await writeListings(csvPath, [listing]);
  expect(result.added).toBe(1);
});

// ── Directory creation ─────────────────────────────────────────────────────────

test('creates missing parent directories', async () => {
  const csvPath = path.join(tmpDir, 'nested', 'deep', 'internships_2026-03-29.csv');

  const result = await writeListings(csvPath, [makeListing()]);

  expect(result.added).toBe(1);
  expect(fs.existsSync(csvPath)).toBe(true);
});

// ── CSV content validation ─────────────────────────────────────────────────────

test('CSV contains header row with expected columns', async () => {
  const csvPath = path.join(tmpDir, 'internships_2026-03-29.csv');

  await writeListings(csvPath, [makeListing()]);

  const firstLine = fs.readFileSync(csvPath, 'utf-8').split('\n')[0];
  expect(firstLine).toContain('Company');
  expect(firstLine).toContain('Title');
  expect(firstLine).toContain('Application Link');
  expect(firstLine).toContain('Source');
});
