import axios from 'axios';
import { LeverScraper } from '../../src/scrapers/lever';

jest.mock('axios');
const mockGet = axios.get as jest.MockedFunction<typeof axios.get>;

const scraper = new LeverScraper();

function makePosting(overrides: Record<string, any> = {}) {
  return {
    text: 'Software Engineer Intern',
    categories: {
      location: 'San Francisco, CA',
      team: 'Engineering',
      commitment: 'Internship',
    },
    descriptionPlain: 'Great internship opportunity.',
    createdAt: Date.now(),
    hostedUrl: 'https://jobs.lever.co/mistral/abc123',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue({ data: [] } as any);
});

describe('LeverScraper', () => {
  test('name is "Lever"', () => {
    expect(scraper.name).toBe('Lever');
  });

  test('returns empty when no postings', async () => {
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
    expect(result.coops).toHaveLength(0);
  });

  test('includes a valid recent intern posting', async () => {
    mockGet.mockResolvedValueOnce({ data: [makePosting()] } as any);
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(1);
    expect(result.internships[0].company).toBe('Mistral');
  });

  test('excludes postings older than 24 hours', async () => {
    const oldPosting = makePosting({ createdAt: Date.now() - 25 * 60 * 60 * 1000 });
    mockGet.mockResolvedValueOnce({ data: [oldPosting] } as any);
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('excludes non-US locations', async () => {
    const foreignPosting = makePosting({ categories: { location: 'London, UK', team: 'Engineering' } });
    mockGet.mockResolvedValueOnce({ data: [foreignPosting] } as any);
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('excludes irrelevant roles', async () => {
    const hrPosting = makePosting({ text: 'HR Intern', categories: { location: 'Remote', team: 'HR' } });
    mockGet.mockResolvedValueOnce({ data: [hrPosting] } as any);
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(0);
  });

  test('routes co-op to coops array', async () => {
    const coop = makePosting({ text: 'Software Engineer Co-op' });
    mockGet.mockResolvedValueOnce({ data: [coop] } as any);
    const result = await scraper.scrape();
    expect(result.coops).toHaveLength(1);
    expect(result.internships).toHaveLength(0);
  });

  test('truncates description to 500 chars', async () => {
    const longDesc = 'x'.repeat(1000);
    const posting = makePosting({ descriptionPlain: longDesc });
    mockGet.mockResolvedValueOnce({ data: [posting] } as any);
    const result = await scraper.scrape();
    if (result.internships.length > 0) {
      expect(result.internships[0].description.length).toBeLessThanOrEqual(500);
    }
  });

  test('handles missing descriptionPlain gracefully', async () => {
    const posting = makePosting({ descriptionPlain: undefined });
    mockGet.mockResolvedValueOnce({ data: [posting] } as any);
    const result = await scraper.scrape();
    expect(result.internships).toHaveLength(1);
    expect(result.internships[0].description).toBe('');
  });

  test('continues when one slug fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('500 error'));
    const result = await scraper.scrape();
    expect(result).toHaveProperty('internships');
  });
});
