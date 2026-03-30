import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { createObjectCsvWriter } from 'csv-writer';
import { JobListing } from './types';

const DATA_DIR = path.resolve(__dirname, '../data');
const today = new Date().toISOString().slice(0, 10);
const INTERNSHIPS_CSV = path.join(DATA_DIR, `internships/internships_${today}.csv`);
const TOP_DIR = path.join(DATA_DIR, 'Top Companies');
const SWE_DIR = path.join(DATA_DIR, 'SWE');
const MLE_DIR = path.join(DATA_DIR, 'MLE');

const CSV_HEADER = [
  { id: 'company', title: 'Company' },
  { id: 'title', title: 'Title' },
  { id: 'description', title: 'Description' },
  { id: 'location', title: 'Location' },
  { id: 'applicationLink', title: 'Application Link' },
  { id: 'source', title: 'Source' },
  { id: 'scrapedAt', title: 'Scraped At' },
];

// ── CSV parser ────────────────────────────────────────────────────────────────

export function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function readCSV(filePath: string): JobListing[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  return lines.slice(1).map((line) => {
    const [company, title, description, location, applicationLink, source, scrapedAt] =
      parseCSVLine(line);
    return { company, title, description, location, applicationLink, source, scrapedAt };
  });
}

// ── Claude classification ─────────────────────────────────────────────────────

type Category = 'TOP_COMPANY' | 'SWE' | 'MLE';

const CLASSIFICATION_PROMPT = `You are classifying tech internship listings into one of three categories.

Categories:
- TOP_COMPANY: Positions at any of the following (regardless of role type):
    Major tech: Google, Meta, Apple, Amazon, Microsoft, Netflix, Uber, Lyft, Airbnb, Twitter/X, LinkedIn, Salesforce, Adobe, Intel, AMD, Nvidia, Qualcomm, Cisco, Oracle, SAP, VMware, Palantir, Snowflake, Databricks, Cloudflare, Twilio, Okta, ServiceNow, Workday, Splunk, CrowdStrike, Palo Alto Networks, Elastic, HashiCorp
    AI labs: OpenAI, Anthropic, DeepMind, Cohere, Mistral, Scale AI, Together AI, Inflection, Perplexity, Stability AI, Hugging Face, xAI
    Quant/HFT: Jane Street, Citadel, Two Sigma, D.E. Shaw, Jump Trading, Hudson River Trading, Optiver, IMC Trading, Virtu, Akuna Capital, SIG, DRW, Tower Research, Voleon, AQR, Renaissance Technologies, PDT Partners, Flow Traders, Susquehanna
    Top startups/unicorns: Stripe, Figma, Notion, Ramp, Linear, Replit, Modal, Confluent, Datadog, Brex, Plaid, Rippling, Airtable, Canva, Vercel, Retool, Anduril, SpaceX, Rivian, Aurora, Waymo, Cruise, Nuro
- MLE: Machine learning engineering, data science, AI/ML research, NLP, computer vision, data analyst, research scientist, applied scientist roles
- SWE: Software engineering, frontend, backend, fullstack, platform, infrastructure, mobile dev, DevOps, SRE, security engineering, embedded, firmware

Rules:
- A TOP_COMPANY listing stays TOP_COMPANY even if the role is MLE or SWE
- If the company is not in the TOP_COMPANY list, use MLE or SWE based on the role title/description
- When unsure between MLE and SWE, prefer SWE

Return ONLY a valid JSON array, no explanation:
[{"index": 0, "category": "SWE"}, {"index": 1, "category": "MLE"}, ...]

Jobs to classify:
`;

function classifyBatch(
  batch: JobListing[],
  offset: number
): { index: number; category: Category }[] {
  const jobs = batch.map((l, i) => ({
    index: offset + i,
    company: l.company,
    title: l.title,
    description: (l.description || '').slice(0, 300),
  }));

  const prompt = CLASSIFICATION_PROMPT + JSON.stringify(jobs, null, 2);

  console.log(`  Classifying jobs ${offset + 1}–${offset + batch.length} via claude CLI...`);

  const result = spawnSync('claude', ['--print'], {
    input: prompt,
    encoding: 'utf-8',
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.status !== 0 || !result.stdout) {
    throw new Error(
      `claude --print failed (exit ${result.status}): ${result.stderr?.slice(0, 500)}`
    );
  }

  // Extract the JSON array from the response (may have surrounding text)
  const match = result.stdout.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(`No JSON array found in response:\n${result.stdout.slice(0, 500)}`);
  }

  return JSON.parse(match[0]) as { index: number; category: Category }[];
}

// Keyword fallback if claude CLI is unavailable or fails a batch
export function classifyByKeyword(listing: JobListing): Category {
  const topCos = [
    'google', 'meta', 'apple', 'amazon', 'microsoft', 'netflix', 'uber', 'lyft', 'airbnb',
    'linkedin', 'salesforce', 'adobe', 'intel', 'amd', 'nvidia', 'qualcomm', 'cisco', 'oracle',
    'palantir', 'snowflake', 'databricks', 'cloudflare', 'openai', 'anthropic', 'deepmind',
    'cohere', 'mistral', 'scaleai', 'together', 'jane street', 'citadel', 'two sigma',
    'de shaw', 'jump trading', 'hudson river', 'optiver', 'imc trading', 'virtu', 'akuna',
    'stripe', 'figma', 'notion', 'ramp', 'linear', 'replit', 'modal', 'confluent', 'datadog',
    'brex', 'plaid', 'rippling', 'airtable', 'canva', 'retool', 'anduril', 'spacex', 'waymo',
  ];
  const co = listing.company.toLowerCase();
  if (topCos.some((t) => co.includes(t))) return 'TOP_COMPANY';

  const mleKeywords = [
    'machine learning', 'data science', 'data scientist', 'ml engineer', 'ai research',
    'nlp', 'computer vision', 'research scientist', 'applied scientist', 'data analyst',
    'deep learning', 'reinforcement learning', 'llm', 'generative ai',
  ];
  const titleLower = listing.title.toLowerCase();
  if (mleKeywords.some((k) => titleLower.includes(k))) return 'MLE';

  return 'SWE';
}

function classifyAll(listings: JobListing[]): Category[] {
  const categories: Category[] = new Array(listings.length).fill('SWE' as Category);
  const BATCH_SIZE = 50;

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE);
    try {
      const results = classifyBatch(batch, i);
      for (const r of results) {
        if (r.index >= 0 && r.index < listings.length) {
          categories[r.index] = r.category;
        }
      }
    } catch (err) {
      console.warn(`  Batch ${i}–${i + batch.length} failed (${(err as Error).message})`);
      console.warn('  Falling back to keyword classification for this batch...');
      for (let j = 0; j < batch.length; j++) {
        categories[i + j] = classifyByKeyword(batch[j]);
      }
    }
  }

  return categories;
}

// ── CSV writer ────────────────────────────────────────────────────────────────

async function writeCSV(dir: string, listings: JobListing[]): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  const csvPath = path.join(dir, `internships_${today}.csv`);

  const writer = createObjectCsvWriter({
    path: csvPath,
    header: CSV_HEADER,
    append: false,
  });

  await writer.writeRecords(listings);
  console.log(`  Wrote ${listings.length} listings → ${csvPath}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Reading internships.csv...');
  const listings = readCSV(INTERNSHIPS_CSV);

  if (listings.length === 0) {
    console.log('No internships found in internships.csv. Run `npm run scrape` first.');
    return;
  }

  console.log(`Found ${listings.length} internships. Classifying...`);
  const categories = classifyAll(listings);

  const top: JobListing[] = [];
  const swe: JobListing[] = [];
  const mle: JobListing[] = [];

  for (let i = 0; i < listings.length; i++) {
    if (categories[i] === 'TOP_COMPANY') top.push(listings[i]);
    else if (categories[i] === 'MLE') mle.push(listings[i]);
    else swe.push(listings[i]);
  }

  console.log(`\nResults: ${top.length} top companies, ${swe.length} SWE, ${mle.length} MLE`);
  console.log('Writing sorted CSVs...');

  await writeCSV(TOP_DIR, top);
  await writeCSV(SWE_DIR, swe);
  await writeCSV(MLE_DIR, mle);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
