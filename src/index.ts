import * as path from 'path';
import { scrapers } from './scrapers';
import { writeListings } from './writer';
import { JobListing } from './types';

const today = new Date().toISOString().slice(0, 10);
const INTERNSHIPS_CSV = path.resolve(__dirname, `../data/internships/internships_${today}.csv`);
const COOPS_CSV = path.resolve(__dirname, `../data/coops/coops_${today}.csv`);

async function main() {
  console.log(`[${new Date().toISOString()}] Starting scrape run`);

  const allInternships: JobListing[] = [];
  const allCoops: JobListing[] = [];

  for (const scraper of scrapers) {
    console.log(`  Scraping: ${scraper.name}`);
    try {
      const result = await scraper.scrape();
      allInternships.push(...result.internships);
      allCoops.push(...result.coops);
      console.log(
        `    → ${result.internships.length} internships, ${result.coops.length} co-ops`
      );
    } catch (err) {
      console.error(`    ✗ ${scraper.name} failed:`, (err as Error).message);
    }
  }

  const internResult = await writeListings(INTERNSHIPS_CSV, allInternships);
  const coopResult = await writeListings(COOPS_CSV, allCoops);

  console.log(
    `\nDone. Internships: +${internResult.added} new, ${internResult.skipped} already seen.`
  );
  console.log(
    `      Co-ops:      +${coopResult.added} new, ${coopResult.skipped} already seen.`
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
