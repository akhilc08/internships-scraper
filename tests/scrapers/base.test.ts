import { BaseScraper } from '../../src/scrapers/base';
import { ScraperResult } from '../../src/types';

// Concrete implementation for testing the abstract base
class TestScraper extends BaseScraper {
  name = 'TestScraper';
  async scrape(): Promise<ScraperResult> {
    return { internships: [], coops: [] };
  }

  // Expose protected methods for testing
  public testNow() { return this.now(); }
  public testMakeInternship(fields: Parameters<BaseScraper['makeInternship']>[0]) {
    return this.makeInternship(fields);
  }
  public testMakeCoop(fields: Parameters<BaseScraper['makeCoop']>[0]) {
    return this.makeCoop(fields);
  }
}

const scraper = new TestScraper();

describe('BaseScraper', () => {
  test('now() returns a valid ISO string', () => {
    const result = scraper.testNow();
    expect(() => new Date(result)).not.toThrow();
    expect(new Date(result).toISOString()).toBe(result);
  });

  test('makeInternship fills source from scraper name', () => {
    const listing = scraper.testMakeInternship({
      company: 'Acme',
      title: 'SWE Intern',
      description: '',
      location: 'NYC',
      applicationLink: 'https://example.com',
    });
    expect(listing.source).toBe('TestScraper');
  });

  test('makeInternship fills scrapedAt with current ISO timestamp', () => {
    const before = Date.now();
    const listing = scraper.testMakeInternship({
      company: 'Acme',
      title: 'SWE Intern',
      description: '',
      location: 'NYC',
      applicationLink: 'https://example.com',
    });
    const after = Date.now();
    const ts = new Date(listing.scrapedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  test('makeInternship preserves all provided fields', () => {
    const fields = {
      company: 'Beta Corp',
      title: 'ML Intern',
      description: 'Great role',
      location: 'San Francisco, CA',
      applicationLink: 'https://beta.com/apply',
    };
    const listing = scraper.testMakeInternship(fields);
    expect(listing.company).toBe(fields.company);
    expect(listing.title).toBe(fields.title);
    expect(listing.description).toBe(fields.description);
    expect(listing.location).toBe(fields.location);
    expect(listing.applicationLink).toBe(fields.applicationLink);
  });

  test('makeCoop fills source from scraper name', () => {
    const listing = scraper.testMakeCoop({
      company: 'Gamma',
      title: 'SWE Co-op',
      description: '',
      location: 'Boston, MA',
      applicationLink: 'https://gamma.com',
    });
    expect(listing.source).toBe('TestScraper');
  });

  test('makeInternship and makeCoop produce identical structure', () => {
    const fields = {
      company: 'Delta',
      title: 'Intern',
      description: '',
      location: 'Remote',
      applicationLink: 'https://delta.com',
    };
    const intern = scraper.testMakeInternship(fields);
    const coop = scraper.testMakeCoop(fields);
    // Same fields, same structure
    expect(Object.keys(intern)).toEqual(Object.keys(coop));
  });
});
