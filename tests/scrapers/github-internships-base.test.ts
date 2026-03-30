import axios from 'axios';
import { GithubInternshipsBase } from '../../src/scrapers/github-internships-base';
import { ScraperResult } from '../../src/types';

jest.mock('axios');
const mockGet = axios.get as jest.MockedFunction<typeof axios.get>;

// Concrete subclass for testing
class TestGithubScraper extends GithubInternshipsBase {
  name = 'TestGithub';
  protected readmeUrl = 'https://example.com/readme';
}

const scraper = new TestGithubScraper();

function htmlPage(tableRows: string): string {
  return `<html><body><table><tbody>${tableRows}</tbody></table></body></html>`;
}

function row5(company: string, title: string, location: string, appLink: string, age: string): string {
  return `<tr>
    <td>${company}</td>
    <td>${title}</td>
    <td>${location}</td>
    <td><a href="${appLink}">Apply</a></td>
    <td>${age}</td>
  </tr>`;
}

function row6(company: string, title: string, location: string, term: string, appLink: string, age: string): string {
  return `<tr>
    <td>${company}</td>
    <td>${title}</td>
    <td>${location}</td>
    <td>${term}</td>
    <td><a href="${appLink}">Apply</a></td>
    <td>${age}</td>
  </tr>`;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GithubInternshipsBase', () => {

  // ── Age filter ───────────────────────────────────────────────────────────────

  test('only includes rows with age === "0d"', async () => {
    const html = htmlPage(
      row5('Acme', 'SWE Intern', 'San Francisco, CA', 'https://apply.com', '0d') +
      row5('Beta', 'SWE Intern', 'Seattle, WA', 'https://beta.com', '1d') +
      row5('Gamma', 'SWE Intern', 'Austin, TX', 'https://gamma.com', '3d')
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(1);
    expect(result.internships[0].company).toBe('Acme');
  });

  // ── Locked jobs ──────────────────────────────────────────────────────────────

  test('skips rows where application cell contains 🔒', async () => {
    const html = htmlPage(
      `<tr>
        <td>LockedCo</td>
        <td>SWE Intern</td>
        <td>New York, NY</td>
        <td>🔒</td>
        <td>0d</td>
      </tr>`
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  // ── US location filter ────────────────────────────────────────────────────────

  test('excludes non-US locations', async () => {
    const html = htmlPage(
      row5('BritishCo', 'SWE Intern', 'London, UK', 'https://british.com', '0d')
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('includes US locations', async () => {
    const html = htmlPage(
      row5('USCo', 'SWE Intern', 'Boston, MA', 'https://usco.com', '0d')
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(1);
  });

  test('includes Remote locations', async () => {
    const html = htmlPage(
      row5('RemoteCo', 'SWE Intern', 'Remote', 'https://remote.com', '0d')
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(1);
  });

  // ── Company continuation (↳) ─────────────────────────────────────────────────

  test('uses last known company when row has ↳', async () => {
    const html = htmlPage(
      row5('ParentCo', 'SWE Intern', 'San Francisco, CA', 'https://parent.com/1', '0d') +
      row5('↳', 'ML Intern', 'Seattle, WA', 'https://parent.com/2', '0d')
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(2);
    expect(result.internships[1].company).toBe('ParentCo');
  });

  // ── Co-op vs internship classification ───────────────────────────────────────

  test('routes co-op titled rows to coops', async () => {
    const html = htmlPage(
      row5('AcmeCo', 'Software Engineer Co-op', 'Remote', 'https://acme.com', '0d')
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.coops).toHaveLength(1);
    expect(result.internships).toHaveLength(0);
  });

  test('routes internship titled rows to internships', async () => {
    const html = htmlPage(
      row5('AcmeCo', 'Software Engineer Intern', 'Remote', 'https://acme.com', '0d')
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(1);
    expect(result.coops).toHaveLength(0);
  });

  // ── 6-column table (off-season format) ──────────────────────────────────────

  test('parses 6-col table (off-season format) correctly', async () => {
    const html = htmlPage(
      row6('OffSeasCo', 'SWE Intern', 'Austin, TX', 'Fall 2026', 'https://offseas.com', '0d')
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(1);
    expect(result.internships[0].applicationLink).toBe('https://offseas.com');
  });

  // ── Skips rows with < 5 cells ────────────────────────────────────────────────

  test('ignores rows with fewer than 5 cells', async () => {
    const html = htmlPage(
      `<tr><td>Only</td><td>Three</td><td>Cells</td></tr>`
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
    expect(result.coops).toHaveLength(0);
  });

  // ── Row with no application link ─────────────────────────────────────────────

  test('skips rows with no application link href', async () => {
    const html = htmlPage(
      `<tr>
        <td>NoCo</td>
        <td>SWE Intern</td>
        <td>Remote</td>
        <td>Apply here</td>
        <td>0d</td>
      </tr>`
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  // ── Multiple tables on the page ──────────────────────────────────────────────

  test('processes multiple tables', async () => {
    const html = `<html><body>
      <table><tbody>${row5('Co1', 'SWE Intern', 'Remote', 'https://co1.com', '0d')}</tbody></table>
      <table><tbody>${row5('Co2', 'Data Intern', 'New York, NY', 'https://co2.com', '0d')}</tbody></table>
    </body></html>`;
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(2);
  });

  // ── <details> multi-location ──────────────────────────────────────────────────

  test('includes row if any location inside <details> is US', async () => {
    const detailsHtml = `<details><summary>3 locations</summary>London, UK<br/>San Francisco, CA<br/>Toronto, ON</details>`;
    const html = htmlPage(
      `<tr>
        <td>MultiCo</td>
        <td>SWE Intern</td>
        <td>${detailsHtml}</td>
        <td><a href="https://multi.com">Apply</a></td>
        <td>0d</td>
      </tr>`
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(1);
  });

  test('excludes row if no location inside <details> is US', async () => {
    const detailsHtml = `<details><summary>2 locations</summary>London, UK<br/>Toronto, ON</details>`;
    const html = htmlPage(
      `<tr>
        <td>ForeignCo</td>
        <td>SWE Intern</td>
        <td>${detailsHtml}</td>
        <td><a href="https://foreign.com">Apply</a></td>
        <td>0d</td>
      </tr>`
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  // ── Sets correct fields on the listing ─────────────────────────────────────

  test('listing has correct company, title, location, applicationLink', async () => {
    const html = htmlPage(
      row5('Stripe', 'Software Engineer Intern', 'San Francisco, CA', 'https://stripe.com/jobs/1', '0d')
    );
    mockGet.mockResolvedValue({ data: html } as any);

    const result = await scraper.scrape();
    const listing = result.internships[0];
    expect(listing.company).toBe('Stripe');
    expect(listing.title).toBe('Software Engineer Intern');
    expect(listing.location).toBe('San Francisco, CA');
    expect(listing.applicationLink).toBe('https://stripe.com/jobs/1');
    expect(listing.source).toBe('TestGithub');
    expect(listing.description).toBe('');
  });
});
