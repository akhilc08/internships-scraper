import * as fs from 'fs';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { spawnSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _pdfParseMod = require('pdf-parse');
// Support both the old function-based API (mocked in tests) and the v2 class-based API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _pdfParseCallable: ((buf: Buffer) => Promise<{ text: string }>) | null =
  typeof _pdfParseMod === 'function' ? _pdfParseMod
  : typeof _pdfParseMod?.default === 'function' ? _pdfParseMod.default
  : null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _PDFParseClass: (new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }> }) | null =
  _pdfParseCallable == null && typeof _pdfParseMod?.PDFParse === 'function'
    ? _pdfParseMod.PDFParse
    : null;
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

export function readCSV(filePath: string): JobListing[] {
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

// ── extractPdfText ────────────────────────────────────────────────────────────

export async function extractPdfText(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Resume PDF not found: ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  let data: { text: string };
  if (_pdfParseCallable) {
    data = await _pdfParseCallable(buffer);
  } else if (_PDFParseClass) {
    const parser = new _PDFParseClass({ data: buffer });
    data = await parser.getText();
  } else {
    throw new Error('pdf-parse: no compatible API found');
  }
  return data.text;
}

// ── rankBatch ─────────────────────────────────────────────────────────────────

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

// ── rankAll ───────────────────────────────────────────────────────────────────

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
