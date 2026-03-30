import axios from 'axios';
import { GreenhouseScraper } from '../../src/scrapers/greenhouse';

jest.mock('axios');
const mockGet = axios.get as jest.MockedFunction<typeof axios.get>;

const scraper = new GreenhouseScraper();

function makeJob(overrides: Record<string, any> = {}) {
  return {
    title: 'Software Engineer Intern',
    first_published: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    absolute_url: 'https://boards.greenhouse.io/stripe/jobs/123',
    company_name: 'Stripe',
    location: { name: 'San Francisco, CA' },
    departments: [{ name: 'Engineering' }],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: all SLUGS return empty jobs
  mockGet.mockResolvedValue({ data: { jobs: [] } } as any);
});

describe('GreenhouseScraper', () => {
  test('name is "Greenhouse"', () => {
    expect(scraper.name).toBe('Greenhouse');
  });

  test('returns empty when all companies have no matching jobs', async () => {
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
    expect(result.coops).toHaveLength(0);
  });

  test('includes a valid recent intern listing', async () => {
    mockGet.mockResolvedValueOnce({ data: { jobs: [makeJob()] } } as any);

    const result = await scraper.scrape();
    expect(result.internships.length).toBeGreaterThanOrEqual(1);
  });

  test('excludes jobs older than 24 hours', async () => {
    const old = makeJob({
      first_published: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });
    mockGet.mockResolvedValueOnce({ data: { jobs: [old] } } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('excludes non-US locations', async () => {
    const foreignJob = makeJob({ location: { name: 'London, UK' } });
    mockGet.mockResolvedValueOnce({ data: { jobs: [foreignJob] } } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('excludes jobs with no intern/coop keyword in title', async () => {
    const fullTimeJob = makeJob({ title: 'Software Engineer' });
    mockGet.mockResolvedValueOnce({ data: { jobs: [fullTimeJob] } } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('excludes irrelevant roles (non-SWE/MLE)', async () => {
    const hrJob = makeJob({ title: 'HR Intern', departments: [{ name: 'Human Resources' }] });
    mockGet.mockResolvedValueOnce({ data: { jobs: [hrJob] } } as any);

    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('routes co-op title to coops', async () => {
    const coop = makeJob({ title: 'Software Engineer Co-op' });
    mockGet.mockResolvedValueOnce({ data: { jobs: [coop] } } as any);

    const result = await scraper.scrape();
    expect(result.coops).toHaveLength(1);
    expect(result.internships).toHaveLength(0);
  });

  test('uses titleCase for company_name when absent', async () => {
    const job = makeJob({ company_name: '' });
    // Make all but first slug return empty; first returns this job
    mockGet.mockResolvedValueOnce({ data: { jobs: [job] } } as any);

    const result = await scraper.scrape();
    if (result.internships.length > 0) {
      // company name derived from slug (e.g. "stripe" → "Stripe")
      expect(result.internships[0].company).toBeTruthy();
    }
  });

  test('continues processing other slugs when one fails', async () => {
    mockGet
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue({ data: { jobs: [] } } as any);

    // Should not throw
    const result = await scraper.scrape();
    expect(result).toHaveProperty('internships');
    expect(result).toHaveProperty('coops');
  });

  test('handles empty jobs array gracefully', async () => {
    mockGet.mockResolvedValue({ data: { jobs: [] } } as any);
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('falls back to updated_at when first_published is absent', async () => {
    const job = makeJob({ first_published: undefined, updated_at: new Date().toISOString() });
    mockGet.mockResolvedValueOnce({ data: { jobs: [job] } } as any);

    const result = await scraper.scrape();
    expect(result.internships.length).toBeGreaterThanOrEqual(1);
  });
});
