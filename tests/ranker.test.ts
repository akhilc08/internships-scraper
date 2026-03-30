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
