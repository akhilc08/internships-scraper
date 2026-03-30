import { Scraper } from '../types';
import { PittCSCSummer2026Scraper } from './pittcsc-summer2026';
import { SimplifySummer2026Scraper } from './simplify-summer2026';
import { PittCSCOffSeasonScraper } from './pittcsc-offseason';
import { SimplifyOffSeasonScraper } from './simplify-offseason';
import { GreenhouseScraper } from './greenhouse';
import { AshbyScraper } from './ashby';
import { LeverScraper } from './lever';

export const scrapers: Scraper[] = [
  new PittCSCSummer2026Scraper(),
  new SimplifySummer2026Scraper(),
  new PittCSCOffSeasonScraper(),
  new SimplifyOffSeasonScraper(),
  new GreenhouseScraper(),
  new AshbyScraper(),
  new LeverScraper(),
];
