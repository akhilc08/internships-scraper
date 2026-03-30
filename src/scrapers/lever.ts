import axios from 'axios';
import { BaseScraper } from './base';
import { ScraperResult, JobListing } from '../types';
import { isUSLocation } from '../utils/us-filter';
import { getJobType, isRelevantRole, isWithin24Hours } from '../utils/job-filter';

// Confirmed working Lever slugs. Others from the original list have moved to Ashby/Greenhouse.
const SLUGS: Record<string, string> = {
  mistral: 'Mistral',
  // Add more as they are confirmed: 'slug': 'Display Name'
};

interface LeverPosting {
  text: string;
  categories: {
    location?: string;
    team?: string;
    commitment?: string;
  };
  descriptionPlain?: string;
  createdAt: number; // epoch ms
  hostedUrl: string;
}

export class LeverScraper extends BaseScraper {
  name = 'Lever';

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
    const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
    const { data } = await axios.get<LeverPosting[]>(url, { timeout: 10_000 });

    const internships: JobListing[] = [];
    const coops: JobListing[] = [];

    for (const job of data ?? []) {
      const jobType = getJobType(job.text);
      if (!jobType) continue;

      if (!isRelevantRole(job.text, job.categories?.team)) continue;
      if (!isWithin24Hours(job.createdAt)) continue;
      if (!isUSLocation(job.categories?.location ?? '')) continue;

      const listing = this.makeInternship({
        company: companyName,
        title: job.text,
        description: (job.descriptionPlain ?? '').slice(0, 500),
        location: job.categories?.location ?? '',
        applicationLink: job.hostedUrl,
      });

      if (jobType === 'coop') coops.push(listing);
      else internships.push(listing);
    }

    return { internships, coops };
  }
}
