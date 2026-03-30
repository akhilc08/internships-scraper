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

const mockPdfParse = pdfParse as unknown as jest.MockedFunction<(...args: any[]) => any>;
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
    expect(lines).toHaveLength(3);
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
    expect(lines[1].startsWith('1,')).toBe(true);
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
