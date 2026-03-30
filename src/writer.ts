import * as fs from 'fs';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { JobListing } from './types';

const CSV_HEADER = [
  { id: 'company', title: 'Company' },
  { id: 'title', title: 'Title' },
  { id: 'description', title: 'Description' },
  { id: 'location', title: 'Location' },
  { id: 'applicationLink', title: 'Application Link' },
  { id: 'source', title: 'Source' },
  { id: 'scrapedAt', title: 'Scraped At' },
];

interface SeenStore {
  // Normalized application URLs (tracking params stripped)
  links: string[];
  // Semantic keys: "normalizedcompany|normalizedtitle" — catches same job from different sources
  semantic: string[];
}

function seenFile(csvPath: string): string {
  // Strip date suffix so all dated CSVs share one seen store per category
  const dir = path.dirname(csvPath);
  const base = path.basename(csvPath).replace(/_\d{4}-\d{2}-\d{2}/, '').replace(/\.csv$/, '');
  return path.join(dir, `${base}.seen.json`);
}

// Strip common tracking/referral params so the same ATS URL from two sources still matches.
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'src', 'gh_src', 'gh_jid'].forEach(
      (p) => u.searchParams.delete(p)
    );
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

function semanticKey(listing: JobListing): string {
  const co = listing.company.toLowerCase().replace(/[^a-z0-9]/g, '');
  const title = listing.title.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${co}|${title}`;
}

function loadSeen(csvPath: string): { linkSet: Set<string>; semanticSet: Set<string> } {
  const sf = seenFile(csvPath);
  if (!fs.existsSync(sf)) return { linkSet: new Set(), semanticSet: new Set() };
  try {
    const store = JSON.parse(fs.readFileSync(sf, 'utf-8')) as SeenStore;
    return {
      linkSet: new Set(store.links ?? []),
      semanticSet: new Set(store.semantic ?? []),
    };
  } catch {
    return { linkSet: new Set(), semanticSet: new Set() };
  }
}

function saveSeen(csvPath: string, linkSet: Set<string>, semanticSet: Set<string>): void {
  const store: SeenStore = {
    links: [...linkSet],
    semantic: [...semanticSet],
  };
  fs.writeFileSync(seenFile(csvPath), JSON.stringify(store, null, 2));
}

export async function writeListings(
  csvPath: string,
  listings: JobListing[]
): Promise<{ added: number; skipped: number }> {
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });

  const { linkSet, semanticSet } = loadSeen(csvPath);

  const newListings: JobListing[] = [];

  for (const l of listings) {
    const normLink = normalizeUrl(l.applicationLink);
    const semKey = semanticKey(l);

    if (linkSet.has(normLink) || semanticSet.has(semKey)) continue;

    newListings.push(l);
    linkSet.add(normLink);
    semanticSet.add(semKey);
  }

  if (newListings.length === 0) {
    return { added: 0, skipped: listings.length };
  }

  const fileExists = fs.existsSync(csvPath);
  const writer = createObjectCsvWriter({
    path: csvPath,
    header: CSV_HEADER,
    append: fileExists,
  });

  await writer.writeRecords(newListings);
  saveSeen(csvPath, linkSet, semanticSet);

  return { added: newListings.length, skipped: listings.length - newListings.length };
}
