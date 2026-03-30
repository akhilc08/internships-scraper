import { GithubInternshipsBase } from './github-internships-base';

export class PittCSCOffSeasonScraper extends GithubInternshipsBase {
  name = 'pittcsc/Summer2026-Internships (Off-Season)';
  protected readmeUrl =
    'https://raw.githubusercontent.com/pittcsc/Summer2026-Internships/dev/README-Off-Season.md';
}
