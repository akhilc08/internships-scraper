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

// ── extractPdfText ────────────────────────────────────────────────────────────

export async function extractPdfText(_filePath: string): Promise<string> {
  throw new Error('not implemented');
}

// ── rankBatch ─────────────────────────────────────────────────────────────────

export async function rankBatch(
  _listings: JobListing[],
  _resumeText: string,
): Promise<(JobListing & { score: number; reasoning: string })[]> {
  throw new Error('not implemented');
}

// ── rankAll ───────────────────────────────────────────────────────────────────

export async function rankAll(
  _listings: JobListing[],
  _resumeText: string,
): Promise<(JobListing & { score: number; reasoning: string })[]> {
  throw new Error('not implemented');
}

// ── writeRankedCSV ────────────────────────────────────────────────────────────

export async function writeRankedCSV(
  _listings: (JobListing & { score: number; reasoning: string })[],
  _outputPath: string,
): Promise<void> {
  throw new Error('not implemented');
}
