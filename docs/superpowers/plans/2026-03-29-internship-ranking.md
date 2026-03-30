# Internship Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `npm run rank` that scores each SWE and MLE internship listing against a matching PDF resume via `claude --print`, outputting ranked CSVs with `Rank` and `Score` columns.

**Architecture:** New `src/ranker.ts` exports five pure, testable functions (`findLatestCSV`, `extractPdfText`, `rankBatch`, `rankAll`, `writeRankedCSV`) plus a `main()` guarded by `require.main === module`. It reads the latest dated CSVs from `data/SWE/` and `data/MLE/`, extracts resume text from `resumes/swe.pdf` / `resumes/mle.pdf` using `pdf-parse`, calls `claude --print` in batches of 20, and writes `ranked_YYYY-MM-DD.csv` files alongside the originals.

**Tech Stack:** TypeScript, `pdf-parse`, `csv-writer` (already installed), `spawnSync` (Node built-in), Jest + `ts-jest`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/ranker.ts` | Create | All ranking logic + `main()` |
| `tests/ranker.test.ts` | Create | Unit tests for all exports |
| `package.json` | Modify | Add `rank` script + `pdf-parse` dependency |
| `.gitignore` | Modify | Add `resumes/` entry |

---

### Task 1: Install dependencies and wire up script

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install `pdf-parse`**

```bash
cd /Users/sickle/Coding/internship-scraper
npm install pdf-parse
npm install --save-dev @types/pdf-parse
```

Expected output: `added N packages` with no errors.

- [ ] **Step 2: Add `rank` script to `package.json`**

In `package.json`, add `"rank": "ts-node src/ranker.ts"` to the `scripts` block:

```json
"scripts": {
  "scrape": "ts-node src/index.ts",
  "sort": "ts-node src/sorter.ts",
  "rank": "ts-node src/ranker.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "test": "jest"
},
```

- [ ] **Step 3: Add `resumes/` to `.gitignore`**

Open `.gitignore` and append:

```
resumes/
```

- [ ] **Step 4: Create the `resumes/` directory with a placeholder**

```bash
mkdir -p /Users/sickle/Coding/internship-scraper/resumes
touch /Users/sickle/Coding/internship-scraper/resumes/.gitkeep
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore resumes/.gitkeep
git commit -m "Add pdf-parse dependency, rank script, resumes dir"
```

---

### Task 2: `findLatestCSV`

**Files:**
- Create: `src/ranker.ts` (initial skeleton + `findLatestCSV`)
- Create: `tests/ranker.test.ts` (full file with all imports/mocks at top; only `findLatestCSV` describe block filled in)

- [ ] **Step 1: Write the failing tests**

Create `tests/ranker.test.ts` with all imports at the top (subsequent tasks only append describe blocks — no new imports needed):

```typescript
// All imports and mock setup live here. jest.mock() calls are hoisted by Jest,
// so they take effect before any imports resolve.
jest.mock('pdf-parse');
jest.mock('child_process');

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import { spawnSync } from 'child_process';
import { JobListing } from '../src/types';
import {
  findLatestCSV,
  extractPdfText,
  rankBatch,
  rankAll,
  writeRankedCSV,
} from '../src/ranker';

const mockPdfParse = pdfParse as jest.MockedFunction<typeof pdfParse>;
const mockSpawnSync = spawnSync as jest.MockedFunction<typeof spawnSync>;

function makeListing(overrides: Partial<JobListing> = {}): JobListing {
  return {
    company: 'Acme',
    title: 'Software Engineer Intern',
    description: 'A great role',
    location: 'Remote',
    applicationLink: 'https://example.com/apply',
    source: 'test',
    scrapedAt: new Date().toISOString(),
    ...overrides,
  };
}

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranker-test-'));
  jest.clearAllMocks();
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── findLatestCSV ─────────────────────────────────────────────────────────────

describe('findLatestCSV', () => {
  test('returns null for empty directory', () => {
    expect(findLatestCSV(tmpDir)).toBeNull();
  });

  test('returns null for non-existent directory', () => {
    expect(findLatestCSV('/nonexistent/ranker-test-path')).toBeNull();
  });

  test('returns the only CSV when one exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'internships_2026-03-29.csv'), '');
    expect(findLatestCSV(tmpDir)).toBe(path.join(tmpDir, 'internships_2026-03-29.csv'));
  });

  test('returns the most recent CSV when multiple exist', () => {
    fs.writeFileSync(path.join(tmpDir, 'internships_2026-03-27.csv'), '');
    fs.writeFileSync(path.join(tmpDir, 'internships_2026-03-29.csv'), '');
    fs.writeFileSync(path.join(tmpDir, 'internships_2026-03-28.csv'), '');
    expect(findLatestCSV(tmpDir)).toBe(path.join(tmpDir, 'internships_2026-03-29.csv'));
  });

  test('ignores non-matching files (ranked CSVs, txt files)', () => {
    fs.writeFileSync(path.join(tmpDir, 'ranked_2026-03-29.csv'), '');
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), '');
    expect(findLatestCSV(tmpDir)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/sickle/Coding/internship-scraper
npm test -- --testPathPattern=ranker 2>&1 | head -30
```

Expected: `Cannot find module '../src/ranker'`

- [ ] **Step 3: Create `src/ranker.ts` with `findLatestCSV`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { spawnSync } from 'child_process';
import { JobListing } from './types';

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      fields.push(current); current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function readCSV(filePath: string): JobListing[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const [company, title, description, location, applicationLink, source, scrapedAt] =
      parseCSVLine(line);
    return { company, title, description, location, applicationLink, source, scrapedAt };
  });
}

// ── findLatestCSV ─────────────────────────────────────────────────────────────

export function findLatestCSV(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^internships_\d{4}-\d{2}-\d{2}\.csv$/.test(f))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return path.join(dir, files[0]);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --testPathPattern=ranker 2>&1 | tail -20
```

Expected: `findLatestCSV > 5 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/ranker.ts tests/ranker.test.ts
git commit -m "Add findLatestCSV with tests"
```

---

### Task 3: `extractPdfText`

**Files:**
- Modify: `src/ranker.ts` (add `extractPdfText`)
- Modify: `tests/ranker.test.ts` (add tests for `extractPdfText`)

- [ ] **Step 1: Write the failing tests**

Append to `tests/ranker.test.ts`, after the `findLatestCSV` describe block (no new imports needed — all mocks are already set up at the top):

```typescript
// ── extractPdfText ────────────────────────────────────────────────────────────

describe('extractPdfText', () => {
  test('throws with clear message if PDF file does not exist', async () => {
    await expect(extractPdfText('/nonexistent/resume.pdf')).rejects.toThrow(
      'Resume PDF not found: /nonexistent/resume.pdf'
    );
  });

  test('returns extracted text from PDF buffer', async () => {
    const fakePdf = path.join(tmpDir, 'test.pdf');
    fs.writeFileSync(fakePdf, 'fake pdf bytes');
    mockPdfParse.mockResolvedValueOnce({
      text: 'TypeScript React Node.js 3 years experience',
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: {},
      version: '1.10.100',
    } as any);

    const result = await extractPdfText(fakePdf);

    expect(result).toBe('TypeScript React Node.js 3 years experience');
    expect(mockPdfParse).toHaveBeenCalledWith(expect.any(Buffer));
  });
});
```

- [ ] **Step 2: Run tests to confirm the new tests fail**

```bash
npm test -- --testPathPattern=ranker 2>&1 | grep -E "FAIL|PASS|extractPdfText"
```

Expected: `extractPdfText` tests fail with `extractPdfText is not a function`.

- [ ] **Step 3: Add `extractPdfText` to `src/ranker.ts`**

Add this import at the top of `src/ranker.ts` (after the existing imports):

```typescript
import pdfParse from 'pdf-parse';
```

Add this export after the `findLatestCSV` export:

```typescript
// ── extractPdfText ────────────────────────────────────────────────────────────

export async function extractPdfText(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Resume PDF not found: ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --testPathPattern=ranker 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ranker.ts tests/ranker.test.ts
git commit -m "Add extractPdfText with tests"
```

---

### Task 4: `rankBatch` and `rankAll`

**Files:**
- Modify: `src/ranker.ts` (add `rankBatch`, `rankAll`)
- Modify: `tests/ranker.test.ts` (add tests for both)

- [ ] **Step 1: Write the failing tests**

Append to `tests/ranker.test.ts` (no new imports needed):

```typescript
// ── rankBatch / rankAll ───────────────────────────────────────────────────────

function makeSpawnResult(stdout: string, status = 0): ReturnType<typeof spawnSync> {
  return { status, stdout, stderr: '', pid: 1, output: [], signal: null } as any;
}

const RESUME = 'TypeScript, React, Node.js, 2 years experience';

describe('rankBatch', () => {
  const listings = [
    makeListing({ company: 'AlphaCo', title: 'SWE Intern' }),
    makeListing({ company: 'BetaCo', title: 'Backend Intern', applicationLink: 'https://beta.com' }),
  ];

  test('returns parsed scores from claude CLI output', () => {
    mockSpawnSync.mockReturnValueOnce(
      makeSpawnResult('[{"index": 0, "score": 9}, {"index": 1, "score": 6}]')
    );
    const result = rankBatch(listings, 0, RESUME);
    expect(result).toEqual([{ index: 0, score: 9 }, { index: 1, score: 6 }]);
  });

  test('extracts JSON from response with surrounding prose', () => {
    mockSpawnSync.mockReturnValueOnce(
      makeSpawnResult('Here are the scores:\n[{"index": 0, "score": 7}]\nDone.')
    );
    const result = rankBatch([listings[0]], 0, RESUME);
    expect(result[0].score).toBe(7);
  });

  test('throws if claude exits non-zero', () => {
    mockSpawnSync.mockReturnValueOnce(makeSpawnResult('', 1));
    expect(() => rankBatch(listings, 0, RESUME)).toThrow('claude --print failed');
  });

  test('throws if response contains no JSON array', () => {
    mockSpawnSync.mockReturnValueOnce(makeSpawnResult('Sorry, cannot help.'));
    expect(() => rankBatch(listings, 0, RESUME)).toThrow('No JSON array');
  });

  test('applies offset to indices', () => {
    mockSpawnSync.mockReturnValueOnce(
      makeSpawnResult('[{"index": 20, "score": 8}, {"index": 21, "score": 5}]')
    );
    const result = rankBatch(listings, 20, RESUME);
    expect(result[0].index).toBe(20);
    expect(result[1].index).toBe(21);
  });
});

describe('rankAll', () => {
  function makeListings(n: number): JobListing[] {
    return Array.from({ length: n }, (_, i) =>
      makeListing({ company: `Co${i}`, applicationLink: `https://example.com/${i}` })
    );
  }

  test('returns score array of same length as listings', () => {
    mockSpawnSync.mockReturnValue(
      makeSpawnResult('[{"index":0,"score":8},{"index":1,"score":6},{"index":2,"score":4}]')
    );
    const scores = rankAll(makeListings(3), RESUME);
    expect(scores).toHaveLength(3);
    expect(scores).toEqual([8, 6, 4]);
  });

  test('falls back to score=5 when a batch fails', () => {
    mockSpawnSync.mockReturnValueOnce(makeSpawnResult('', 1));
    const scores = rankAll(makeListings(2), RESUME);
    expect(scores).toEqual([5, 5]);
  });

  test('clamps scores above 10 down to 10', () => {
    mockSpawnSync.mockReturnValueOnce(makeSpawnResult('[{"index":0,"score":15}]'));
    const scores = rankAll(makeListings(1), RESUME);
    expect(scores[0]).toBe(10);
  });

  test('clamps scores below 1 up to 1', () => {
    mockSpawnSync.mockReturnValueOnce(makeSpawnResult('[{"index":0,"score":-3}]'));
    const scores = rankAll(makeListings(1), RESUME);
    expect(scores[0]).toBe(1);
  });

  test('batches in groups of 20 and merges results', () => {
    // 25 listings → 2 batches (20 + 5)
    const listings = makeListings(25);
    const batch1 = Array.from({ length: 20 }, (_, i) => ({ index: i, score: i + 1 }));
    const batch2 = Array.from({ length: 5 }, (_, i) => ({ index: 20 + i, score: i + 1 }));
    mockSpawnSync
      .mockReturnValueOnce(makeSpawnResult(JSON.stringify(batch1)))
      .mockReturnValueOnce(makeSpawnResult(JSON.stringify(batch2)));

    const scores = rankAll(listings, RESUME);
    expect(scores).toHaveLength(25);
    expect(mockSpawnSync).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to confirm the new tests fail**

```bash
npm test -- --testPathPattern=ranker 2>&1 | grep -E "rankBatch|rankAll|FAIL"
```

Expected: `rankBatch is not a function`, `rankAll is not a function`.

- [ ] **Step 3: Add `rankBatch` and `rankAll` to `src/ranker.ts`**

Add after the `extractPdfText` export:

```typescript
// ── rankBatch / rankAll ───────────────────────────────────────────────────────

const RANK_PROMPT = (resumeText: string, jobs: object[]): string =>
  `You are scoring tech internship listings against a candidate's resume to help them prioritize applications.

Resume:
${resumeText}

Score each listing 1–10 based on how well it matches the candidate's skills, experience, and background.
10 = excellent fit, 1 = poor fit. Consider: tech stack overlap, role type match, seniority fit.

Return ONLY a valid JSON array, no explanation:
[{"index": 0, "score": 8}, {"index": 1, "score": 3}, ...]

Listings to score:
${JSON.stringify(jobs, null, 2)}`;

export function rankBatch(
  batch: JobListing[],
  offset: number,
  resumeText: string
): { index: number; score: number }[] {
  const jobs = batch.map((l, i) => ({
    index: offset + i,
    company: l.company,
    title: l.title,
    description: (l.description || '').slice(0, 300),
  }));

  const result = spawnSync('claude', ['--print'], {
    input: RANK_PROMPT(resumeText, jobs),
    encoding: 'utf-8',
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.status !== 0 || !result.stdout) {
    throw new Error(
      `claude --print failed (exit ${result.status}): ${result.stderr?.slice(0, 500)}`
    );
  }

  const match = result.stdout.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(`No JSON array in response:\n${result.stdout.slice(0, 500)}`);
  }

  return JSON.parse(match[0]) as { index: number; score: number }[];
}

export function rankAll(listings: JobListing[], resumeText: string): number[] {
  const scores: number[] = new Array(listings.length).fill(5);
  const BATCH_SIZE = 20;

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE);
    console.log(`  Ranking listings ${i + 1}–${i + batch.length} via claude CLI...`);
    try {
      const results = rankBatch(batch, i, resumeText);
      for (const r of results) {
        if (r.index >= 0 && r.index < listings.length) {
          scores[r.index] = Math.min(10, Math.max(1, r.score));
        }
      }
    } catch (err) {
      console.warn(`  Batch ${i + 1}–${i + batch.length} failed: ${(err as Error).message}`);
      console.warn('  Falling back to score=5 for this batch...');
    }
  }

  return scores;
}
```

- [ ] **Step 4: Run all ranker tests**

```bash
npm test -- --testPathPattern=ranker 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ranker.ts tests/ranker.test.ts
git commit -m "Add rankBatch and rankAll with tests"
```

---

### Task 5: `writeRankedCSV`

**Files:**
- Modify: `src/ranker.ts` (add `writeRankedCSV`)
- Modify: `tests/ranker.test.ts` (add tests for `writeRankedCSV`)

- [ ] **Step 1: Write the failing tests**

Append to `tests/ranker.test.ts` (no new imports needed):

```typescript
// ── writeRankedCSV ────────────────────────────────────────────────────────────

describe('writeRankedCSV', () => {
  test('creates a CSV with Rank and Score as first two columns', async () => {
    const outputPath = path.join(tmpDir, 'ranked_2026-03-29.csv');
    await writeRankedCSV(outputPath, [makeListing()], [8]);

    const firstLine = fs.readFileSync(outputPath, 'utf-8').split('\n')[0];
    expect(firstLine.startsWith('Rank,Score,')).toBe(true);
  });

  test('sorts listings by score descending', async () => {
    const outputPath = path.join(tmpDir, 'ranked_2026-03-29.csv');
    const listings = [
      makeListing({ company: 'LowCo', applicationLink: 'https://low.com' }),
      makeListing({ company: 'HighCo', applicationLink: 'https://high.com' }),
    ];
    await writeRankedCSV(outputPath, listings, [3, 9]);

    const lines = fs.readFileSync(outputPath, 'utf-8').split('\n').filter((l) => l.trim());
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain('HighCo');
    expect(lines[2]).toContain('LowCo');
  });

  test('assigns 1-based rank numbers in correct order', async () => {
    const outputPath = path.join(tmpDir, 'ranked_2026-03-29.csv');
    const listings = [
      makeListing({ company: 'A', applicationLink: 'https://a.com' }),
      makeListing({ company: 'B', applicationLink: 'https://b.com' }),
      makeListing({ company: 'C', applicationLink: 'https://c.com' }),
    ];
    await writeRankedCSV(outputPath, listings, [5, 8, 2]);

    const lines = fs.readFileSync(outputPath, 'utf-8').split('\n').filter((l) => l.trim());
    expect(lines[1].startsWith('1,')).toBe(true); // rank 1 = score 8 (B)
    expect(lines[2].startsWith('2,')).toBe(true);
    expect(lines[3].startsWith('3,')).toBe(true);
  });

  test('creates parent directories if missing', async () => {
    const outputPath = path.join(tmpDir, 'nested', 'SWE', 'ranked_2026-03-29.csv');
    await writeRankedCSV(outputPath, [makeListing()], [7]);
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  test('includes all original listing columns', async () => {
    const outputPath = path.join(tmpDir, 'ranked_2026-03-29.csv');
    const listing = makeListing({
      company: 'TestCorp',
      title: 'SWE Intern',
      location: 'NYC',
      applicationLink: 'https://testcorp.com/apply',
    });
    await writeRankedCSV(outputPath, [listing], [6]);

    const content = fs.readFileSync(outputPath, 'utf-8');
    expect(content).toContain('TestCorp');
    expect(content).toContain('SWE Intern');
    expect(content).toContain('NYC');
    expect(content).toContain('https://testcorp.com/apply');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern=ranker 2>&1 | grep "writeRankedCSV"
```

Expected: `writeRankedCSV is not a function`.

- [ ] **Step 3: Add `writeRankedCSV` to `src/ranker.ts`**

Add after the `rankAll` export:

```typescript
// ── writeRankedCSV ────────────────────────────────────────────────────────────

const RANKED_CSV_HEADER = [
  { id: 'rank', title: 'Rank' },
  { id: 'score', title: 'Score' },
  { id: 'company', title: 'Company' },
  { id: 'title', title: 'Title' },
  { id: 'description', title: 'Description' },
  { id: 'location', title: 'Location' },
  { id: 'applicationLink', title: 'Application Link' },
  { id: 'source', title: 'Source' },
  { id: 'scrapedAt', title: 'Scraped At' },
];

export async function writeRankedCSV(
  outputPath: string,
  listings: JobListing[],
  scores: number[]
): Promise<void> {
  const paired = listings.map((l, i) => ({ listing: l, score: scores[i] }));
  paired.sort((a, b) => b.score - a.score);

  const records = paired.map((p, i) => ({
    rank: i + 1,
    score: p.score,
    ...p.listing,
  }));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const writer = createObjectCsvWriter({ path: outputPath, header: RANKED_CSV_HEADER });
  await writer.writeRecords(records);
  console.log(`  Wrote ${records.length} ranked listings → ${outputPath}`);
}
```

- [ ] **Step 4: Run all ranker tests**

```bash
npm test -- --testPathPattern=ranker 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ranker.ts tests/ranker.test.ts
git commit -m "Add writeRankedCSV with tests"
```

---

### Task 6: `main()` and full wiring

**Files:**
- Modify: `src/ranker.ts` (add `main()` + `require.main` guard)

- [ ] **Step 1: Add `main()` to the bottom of `src/ranker.ts`**

Append to `src/ranker.ts`:

```typescript
// ── main ─────────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(__dirname, '../data');
const today = new Date().toISOString().slice(0, 10);

async function main(): Promise<void> {
  const resumesDir = path.resolve(__dirname, '../resumes');
  const sweResumePath = path.join(resumesDir, 'swe.pdf');
  const mleResumePath = path.join(resumesDir, 'mle.pdf');

  const missingSwe = !fs.existsSync(sweResumePath);
  const missingMle = !fs.existsSync(mleResumePath);
  if (missingSwe || missingMle) {
    const missing = [missingSwe && sweResumePath, missingMle && mleResumePath].filter(Boolean);
    console.error(`Missing resume files:\n${(missing as string[]).join('\n')}`);
    console.error('Place your resumes in the resumes/ directory and try again.');
    process.exit(1);
  }

  const tracks = [
    { label: 'SWE', dir: path.join(DATA_DIR, 'SWE'), resumePath: sweResumePath },
    { label: 'MLE', dir: path.join(DATA_DIR, 'MLE'), resumePath: mleResumePath },
  ];

  for (const track of tracks) {
    console.log(`\n[${track.label}] Starting ranking...`);

    const csvPath = findLatestCSV(track.dir);
    if (!csvPath) {
      console.warn(`  No internships CSV found in ${track.dir}. Run \`npm run sort\` first.`);
      continue;
    }

    console.log(`  Input:  ${csvPath}`);
    console.log(`  Resume: ${track.resumePath}`);
    console.log(`  Extracting resume text...`);
    const resumeText = await extractPdfText(track.resumePath);

    const listings = readCSV(csvPath);
    if (listings.length === 0) {
      console.warn(`  CSV is empty or has no data rows. Skipping.`);
      continue;
    }

    console.log(`  Found ${listings.length} listings. Ranking...`);
    const scores = rankAll(listings, resumeText);

    const outputPath = path.join(track.dir, `ranked_${today}.csv`);
    await writeRankedCSV(outputPath, listings, scores);
  }

  console.log('\nDone.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Run the full test suite to make sure nothing broke**

```bash
npm test 2>&1 | tail -20
```

Expected: All existing tests still pass. Ranker tests pass. No regressions.

- [ ] **Step 3: Build TypeScript to catch any type errors**

```bash
npm run build 2>&1
```

Expected: No errors. (Ranker is excluded from the build tsconfig since `rootDir` is `src/`, but `ts-node` will still catch errors at runtime.)

- [ ] **Step 4: Smoke-test with missing resumes (expected failure)**

```bash
npm run rank 2>&1
```

Expected output:
```
Missing resume files:
.../resumes/swe.pdf
.../resumes/mle.pdf
Place your resumes in the resumes/ directory and try again.
```

- [ ] **Step 5: Smoke-test with missing sort output (expected skip)**

```bash
# Temporarily rename the SWE dir to simulate missing sort output
mv data/SWE data/SWE.bak 2>/dev/null || true
# Add a fake resume so the file-check passes
echo "fake" > resumes/swe.pdf
echo "fake" > resumes/mle.pdf
npm run rank 2>&1
mv data/SWE.bak data/SWE 2>/dev/null || true
rm resumes/swe.pdf resumes/mle.pdf
```

Expected: Logs `No internships CSV found in .../SWE` and continues without crash.

- [ ] **Step 6: Commit**

```bash
git add src/ranker.ts
git commit -m "Add ranker main() with guard and full track orchestration"
```
