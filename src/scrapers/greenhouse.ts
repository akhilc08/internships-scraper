import axios from 'axios';
import { BaseScraper } from './base';
import { ScraperResult, JobListing } from '../types';
import { isUSLocation } from '../utils/us-filter';
import { getJobType, isRelevantRole, isWithin24Hours } from '../utils/job-filter';

// Only slugs confirmed to return 200 on the Greenhouse v1 API.
// Others use Ashby or Greenhouse with different slugs.
const SLUGS = [
  'stripe', 'figma', 'airbnb', 'brex', 'anthropic',
  'databricks', 'datadog', 'scaleai', 'togetherai',
];

interface GreenhouseJob {
  title: string;
  first_published: string; // ISO timestamp — when the role was first posted
  updated_at: string;
  absolute_url: string;
  company_name: string;
  location: { name: string };
  departments?: { name: string }[];
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

export class GreenhouseScraper extends BaseScraper {
  name = 'Greenhouse';

  async scrape(): Promise<ScraperResult> {
    const internships: JobListing[] = [];
    const coops: JobListing[] = [];

    const results = await Promise.allSettled(SLUGS.map((s) => this.fetchCompany(s)));
    for (const r of results) {
      if (r.status === 'rejected') continue;
      internships.push(...r.value.internships);
      coops.push(...r.value.coops);
    }

    return { internships, coops };
  }

  private async fetchCompany(slug: string): Promise<ScraperResult> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
    const { data } = await axios.get<GreenhouseResponse>(url, { timeout: 10_000 });

    const internships: JobListing[] = [];
    const coops: JobListing[] = [];

    for (const job of data.jobs ?? []) {
      const jobType = getJobType(job.title);
      if (!jobType) continue;

      const team = job.departments?.[0]?.name;
      if (!isRelevantRole(job.title, team)) continue;

      // Use first_published (when role was first posted), fall back to updated_at
      if (!isWithin24Hours(job.first_published ?? job.updated_at)) continue;
      if (!isUSLocation(job.location?.name ?? '')) continue;

      const listing = this.makeInternship({
        company: job.company_name || this.titleCase(slug),
        title: job.title,
        description: '',
        location: job.location?.name ?? '',
        applicationLink: job.absolute_url,
      });

      if (jobType === 'coop') coops.push(listing);
      else internships.push(listing);
    }

    return { internships, coops };
  }

  private titleCase(slug: string): string {
    return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}
