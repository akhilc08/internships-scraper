import axios from 'axios';
import { BaseScraper } from './base';
import { ScraperResult, JobListing } from '../types';
import { isUSLocation } from '../utils/us-filter';
import { getJobType, isRelevantRole, isWithin24Hours } from '../utils/job-filter';

// Confirmed working slugs on api.ashbyhq.com/posting-api/job-board/{slug}
const SLUGS: Record<string, string> = {
  openai: 'OpenAI',
  ramp: 'Ramp',
  notion: 'Notion',
  linear: 'Linear',
  replit: 'Replit',
  confluent: 'Confluent',
  snowflake: 'Snowflake',
  modal: 'Modal',
  cohere: 'Cohere',
};

interface AshbyJob {
  title: string;
  department?: string;
  team?: string;
  location: string;
  secondaryLocations?: string[];
  publishedAt: string; // ISO timestamp
  jobUrl: string;
  descriptionPlain?: string;
  isRemote?: boolean | null;
  address?: {
    postalAddress?: {
      addressCountry?: string;
    };
  };
}

interface AshbyResponse {
  jobs: AshbyJob[];
}

export class AshbyScraper extends BaseScraper {
  name = 'Ashby';

  async scrape(): Promise<ScraperResult> {
    const internships: JobListing[] = [];
    const coops: JobListing[] = [];

    const results = await Promise.allSettled(
      Object.entries(SLUGS).map(([slug, name]) => this.fetchCompany(slug, name))
    );

    for (const r of results) {
      if (r.status === 'rejected') continue;
      internships.push(...r.value.internships);
      coops.push(...r.value.coops);
    }

    return { internships, coops };
  }

  private async fetchCompany(slug: string, companyName: string): Promise<ScraperResult> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
    const { data } = await axios.get<AshbyResponse>(url, { timeout: 10_000 });

    const internships: JobListing[] = [];
    const coops: JobListing[] = [];

    for (const job of data.jobs ?? []) {
      const jobType = getJobType(job.title);
      if (!jobType) continue;

      if (!isRelevantRole(job.title, job.team ?? job.department)) continue;
      if (!isWithin24Hours(job.publishedAt)) continue;

      // Ashby provides country in address; use that for a reliable US check
      const country = (job.address?.postalAddress?.addressCountry ?? '').toLowerCase();
      const locationStr = job.isRemote ? 'Remote' : job.location;

      // Explicit non-US country → exclude immediately, regardless of location string
      if (country && country !== 'united states') continue;
      // No country → fall back to location string
      if (!country && !isUSLocation(locationStr)) continue;

      const listing = this.makeInternship({
        company: companyName,
        title: job.title,
        description: (job.descriptionPlain ?? '').slice(0, 500),
        location: locationStr,
        applicationLink: job.jobUrl,
      });

      if (jobType === 'coop') coops.push(listing);
      else internships.push(listing);
    }

    return { internships, coops };
  }
}
