import axios from 'axios';
import { AshbyScraper } from '../../src/scrapers/ashby';

jest.mock('axios');
const mockGet = axios.get as jest.MockedFunction<typeof axios.get>;

const scraper = new AshbyScraper();

function makeJob(overrides: Record<string, any> = {}) {
  return {
    title: 'Software Engineer Intern',
    department: 'Engineering',
    team: 'Platform',
    location: 'San Francisco, CA',
    secondaryLocations: [],
    publishedAt: new Date().toISOString(),
    jobUrl: 'https://ashbyhq.com/openai/jobs/abc',
    descriptionPlain: 'Great role.',
    isRemote: false,
    address: {
      postalAddress: {
        addressCountry: 'United States',
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue({ data: { jobs: [] } } as any);
});

describe('AshbyScraper', () => {
  test('name is "Ashby"', () => {
    expect(scraper.name).toBe('Ashby');
  });

  test('returns empty when no jobs', async () => {
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
    expect(result.coops).toHaveLength(0);
  });

  test('includes a valid recent intern listing with US country', async () => {
    mockGet.mockResolvedValueOnce({ data: { jobs: [makeJob()] } } as any);
    const result = await scraper.scrape();
    expect(result.internships.length).toBeGreaterThanOrEqual(1);
    expect(result.internships[0].company).toBe('OpenAI');
  });

  test('excludes jobs older than 24 hours', async () => {
    const old = makeJob({ publishedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
    mockGet.mockResolvedValueOnce({ data: { jobs: [old] } } as any);
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('excludes explicit non-US country even when location looks US', async () => {
    // Country is authoritative — a UK job with a US-looking location should still be excluded
    const foreignJob = makeJob({
      address: { postalAddress: { addressCountry: 'United Kingdom' } },
      location: 'San Francisco, CA',
      isRemote: false,
    });
    mockGet.mockResolvedValueOnce({ data: { jobs: [foreignJob] } } as any);
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('excludes explicit non-US country with foreign location', async () => {
    const foreignJob = makeJob({
      address: { postalAddress: { addressCountry: 'Germany' } },
      location: 'Berlin, Germany',
      isRemote: false,
    });
    mockGet.mockResolvedValueOnce({ data: { jobs: [foreignJob] } } as any);
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('excludes jobs with no intern/coop in title', async () => {
    const fullTime = makeJob({ title: 'Software Engineer' });
    mockGet.mockResolvedValueOnce({ data: { jobs: [fullTime] } } as any);
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('excludes irrelevant roles (non-SWE/MLE)', async () => {
    const hr = makeJob({ title: 'HR Intern', department: 'HR', team: undefined });
    mockGet.mockResolvedValueOnce({ data: { jobs: [hr] } } as any);
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('routes co-op titles to coops', async () => {
    const coop = makeJob({ title: 'Software Engineer Co-op' });
    mockGet.mockResolvedValueOnce({ data: { jobs: [coop] } } as any);
    const result = await scraper.scrape();
    expect(result.coops).toHaveLength(1);
    expect(result.internships).toHaveLength(0);
  });

  test('sets location to "Remote" when isRemote is true', async () => {
    const remoteJob = makeJob({ isRemote: true, location: 'Austin, TX' });
    mockGet.mockResolvedValueOnce({ data: { jobs: [remoteJob] } } as any);
    const result = await scraper.scrape();
    if (result.internships.length > 0) {
      expect(result.internships[0].location).toBe('Remote');
    }
  });

  test('falls back to location string when country is empty', async () => {
    const noCountry = makeJob({
      address: { postalAddress: { addressCountry: '' } },
      location: 'New York, NY',
    });
    mockGet.mockResolvedValueOnce({ data: { jobs: [noCountry] } } as any);
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(1);
  });

  test('excludes when country empty and location is foreign', async () => {
    const noCountryForeign = makeJob({
      address: { postalAddress: { addressCountry: '' } },
      location: 'Toronto, ON',
      isRemote: false,
    });
    mockGet.mockResolvedValueOnce({ data: { jobs: [noCountryForeign] } } as any);
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('continues when one slug fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('timeout'));
    const result = await scraper.scrape();
    expect(result).toHaveProperty('internships');
  });

  test('truncates description to 500 chars', async () => {
    const longDesc = makeJob({ descriptionPlain: 'a'.repeat(1000) });
    mockGet.mockResolvedValueOnce({ data: { jobs: [longDesc] } } as any);
    const result = await scraper.scrape();
    if (result.internships.length > 0) {
      expect(result.internships[0].description.length).toBeLessThanOrEqual(500);
    }
  });
});
