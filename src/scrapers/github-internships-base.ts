import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseScraper } from './base';
import { ScraperResult, JobListing } from '../types';
import { isUSLocation } from '../utils/us-filter';
import { getJobType } from '../utils/job-filter';

// Shared parser for GitHub-hosted internship lists that use the pittcsc/SimplifyJobs
// HTML table format: Company | Role | Location | Application | Age
export abstract class GithubInternshipsBase extends BaseScraper {
  protected abstract readmeUrl: string;

  async scrape(): Promise<ScraperResult> {
    const { data: html } = await axios.get<string>(this.readmeUrl, {
      timeout: 15_000,
    });

    const $ = cheerio.load(html);
    return this.parseTables($);
  }

  private parseTables($: cheerio.CheerioAPI): ScraperResult {
    const internships: JobListing[] = [];
    const coops: JobListing[] = [];

    $('table').each((_tableIdx, table) => {
      let lastCompany = '';

      $(table)
        .find('tbody tr')
        .each((_rowIdx, row) => {
          const cells = $(row).find('td');
          // 5-col: Company | Role | Location | Application | Age
          // 6-col: Company | Role | Location | Term | Application | Age  (off-season)
          if (cells.length < 5) return;
          const is6Col = cells.length >= 6;
          const ageIdx = is6Col ? 5 : 4;
          const appIdx = is6Col ? 4 : 3;

          const age = $(cells[ageIdx]).text().trim();
          if (age !== '0d') return;

          const appCell = $(cells[appIdx]);
          if (appCell.text().trim().includes('🔒')) return;

          // Company: "↳" means same company as previous row
          const companyRaw = $(cells[0]).text().trim();
          if (companyRaw && companyRaw !== '↳') {
            lastCompany = companyRaw;
          }
          const company = lastCompany;
          if (!company) return;

          const title = $(cells[1]).text().trim();

          // Location may use <details> for multiple locations
          const locationCell = $(cells[2]);
          const detailsEl = locationCell.find('details');
          let location: string;
          let locationsToCheck: string[];

          if (detailsEl.length > 0) {
            const detailsHtml = detailsEl.html() ?? '';
            const summaryText = detailsEl.find('summary').text().trim();
            const innerText = detailsHtml
              .replace(/<summary>[\s\S]*?<\/summary>/, '')
              .replace(/<br\s*\/?>/gi, '|')
              .replace(/<[^>]+>/g, '')
              .trim();
            locationsToCheck = innerText.split('|').map((l) => l.trim()).filter(Boolean);
            location = locationsToCheck.length > 0 ? locationsToCheck.join(' | ') : summaryText;
          } else {
            location = locationCell.text().trim();
            locationsToCheck = [location];
          }

          if (!locationsToCheck.some(isUSLocation)) return;

          const applicationLink = appCell.find('a').first().attr('href') ?? '';
          if (!applicationLink) return;

          const listing = this.makeInternship({ company, title, description: '', location, applicationLink });
          const jobType = getJobType(title);
          if (jobType === 'coop') coops.push(listing);
          else internships.push(listing);
        });
    });

    return { internships, coops };
  }
}
