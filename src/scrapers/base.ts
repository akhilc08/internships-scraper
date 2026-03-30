import { Scraper, ScraperResult, JobListing } from '../types';

export abstract class BaseScraper implements Scraper {
  abstract name: string;
  abstract scrape(): Promise<ScraperResult>;

  protected now(): string {
    return new Date().toISOString();
  }

  protected makeInternship(
    fields: Omit<JobListing, 'source' | 'scrapedAt'>
  ): JobListing {
    return { ...fields, source: this.name, scrapedAt: this.now() };
  }

  protected makeCoop(
    fields: Omit<JobListing, 'source' | 'scrapedAt'>
  ): JobListing {
    return { ...fields, source: this.name, scrapedAt: this.now() };
  }
}
