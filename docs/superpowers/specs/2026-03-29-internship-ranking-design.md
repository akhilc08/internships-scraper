# Internship Ranking Feature — Design Spec
Date: 2026-03-29

## Overview

A new `npm run rank` script (`src/ranker.ts`) that scores each classified internship listing against the user's resume and outputs ranked CSVs. SWE and MLE listings are ranked independently using separate resumes.

## Pipeline Position

```
npm run scrape  →  data/internships/internships_YYYY-MM-DD.csv
npm run sort    →  data/SWE/internships_YYYY-MM-DD.csv
                   data/MLE/internships_YYYY-MM-DD.csv
                   data/Top Companies/internships_YYYY-MM-DD.csv
npm run rank    →  data/SWE/ranked_YYYY-MM-DD.csv
                   data/MLE/ranked_YYYY-MM-DD.csv
```

Top Companies listings are not ranked (no clear single resume to score against).

## Inputs

- `resumes/swe.pdf` — SWE resume (gitignored)
- `resumes/mle.pdf` — MLE resume (gitignored)
- Latest `data/SWE/internships_YYYY-MM-DD.csv` (auto-detected by most recent date)
- Latest `data/MLE/internships_YYYY-MM-DD.csv` (auto-detected by most recent date)

## Output

Two new ranked CSV files:
- `data/SWE/ranked_YYYY-MM-DD.csv`
- `data/MLE/ranked_YYYY-MM-DD.csv`

Columns: `Rank, Score, Company, Title, Description, Location, Application Link, Source, Scraped At`

Sorted descending by Score. Rank is 1-based integer. Score is 1–10.

## Components

### `extractPdfText(filePath: string): Promise<string>`
Uses `pdf-parse` to extract plain text from a PDF file. Throws with a clear message if the file is missing.

### `findLatestCSV(dir: string): string | null`
Scans a directory for files matching `internships_YYYY-MM-DD.csv`, returns the path with the most recent date, or `null` if none found.

### `rankBatch(batch: JobListing[], offset: number, resumeText: string): { index: number; score: number }[]`
Calls `claude --print` via `spawnSync` with a prompt containing the resume text and a JSON array of job listings (company, title, first 300 chars of description). Returns parsed JSON scores.

### `rankAll(listings: JobListing[], resumeText: string): number[]`
Splits listings into batches of 20 (smaller than the sort's 50 to account for resume text in prompt), calls `rankBatch` per batch. On batch failure, falls back to score=5 for that batch (neutral, preserves relative ordering of non-failed batches).

### `writeRankedCSV(outputPath: string, listings: JobListing[], scores: number[]): Promise<void>`
Pairs listings with scores, sorts descending, assigns 1-based ranks, writes CSV using `csv-writer`.

### `main()`
Orchestrates both tracks in sequence: SWE then MLE.

## Prompt Design

```
You are scoring tech internship listings against a candidate's resume to help them prioritize applications.

Resume:
<resume text>

Score each listing 1–10 based on how well it matches the candidate's skills, experience, and background.
10 = excellent fit, 1 = poor fit. Consider: tech stack overlap, role type match, seniority fit.

Return ONLY a valid JSON array, no explanation:
[{"index": 0, "score": 8}, {"index": 1, "score": 3}, ...]

Listings to score:
<JSON array of {index, company, title, description}>
```

## Error Handling

- Missing resume PDF → exit with clear message before processing
- Missing input CSV → skip that track with a warning
- Claude batch failure → fallback score of 5 for that batch (logged as warning)
- Malformed Claude JSON response → same fallback

## Dependencies

New: `pdf-parse` + `@types/pdf-parse`

## File Changes

| File | Change |
|------|--------|
| `src/ranker.ts` | New file |
| `package.json` | Add `"rank": "ts-node src/ranker.ts"` script + `pdf-parse` dependency |
| `.gitignore` | Add `resumes/` |
