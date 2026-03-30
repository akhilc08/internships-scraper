export interface JobListing {
  company: string;
  title: string;
  description: string;
  location: string;
  applicationLink: string;
  source: string;
  scrapedAt: string;
}

export interface ScraperResult {
  internships: JobListing[];
  coops: JobListing[];
}

export interface Scraper {
  name: string;
  scrape(): Promise<ScraperResult>;
}
