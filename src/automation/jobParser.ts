import { Page, Locator } from 'playwright';
import { logger } from '../utils/logger';
import { JobListing } from '../types';
import { humanClick, scrollToElement, simulateReadingTime } from '../utils/humanBehavior';
import { pageLoadDelay } from '../utils/delays';
import * as crypto from 'crypto';

export class JobParser {
  constructor(private page: Page) {}

  /**
   * Parse a job card to extract basic information
   */
  async parseJobCard(card: Locator): Promise<Partial<JobListing> | null> {
    try {
      // Extract text content
      const title = await this.extractText(card, [
        '[data-test="job-title"]',
        '.job_title',
        '[class*="title"]',
        'h2',
        'h3',
      ]);

      const company = await this.extractText(card, [
        '[data-test="company-name"]',
        '.company_name',
        '[class*="company"]',
        '[class*="employer"]',
      ]);

      const location = await this.extractText(card, [
        '[data-test="job-location"]',
        '.location',
        '[class*="location"]',
      ]);

      const salary = await this.extractText(card, [
        '[data-test="salary"]',
        '.salary',
        '[class*="salary"]',
        '[class*="compensation"]',
      ]);

      const postedDate = await this.extractText(card, [
        '[data-test="posted-date"]',
        '.posted_date',
        '[class*="posted"]',
        'time',
      ]);

      // Get job URL
      const url = await this.extractLink(card);

      // Check for 1-Click Apply
      const hasOneClickApply = await this.has1ClickApply(card);

      if (!title || !company) {
        logger.warn('Job card missing required fields', { title, company });
        return null;
      }

      // Generate a unique ID
      const id = this.generateJobId(title, company, url || '');

      return {
        id,
        title,
        company,
        location: location || 'Unknown',
        salary,
        postedDate: postedDate || 'Unknown',
        url: url || '',
        hasOneClickApply,
        scrapedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to parse job card', { error });
      return null;
    }
  }

  /**
   * Navigate to job detail page and extract full information
   */
  async parseJobDetail(job: Partial<JobListing>): Promise<JobListing | null> {
    try {
      if (!job.url) {
        logger.warn('No URL provided for job detail');
        return null;
      }

      logger.info('Parsing job detail', { title: job.title, url: job.url });

      // Navigate to job page
      await this.page.goto(job.url, { waitUntil: 'domcontentloaded' });
      await pageLoadDelay();

      // Extract job description
      const description = await this.extractJobDescription();

      // Extract requirements
      const requirements = await this.extractRequirements();

      // Extract benefits
      const benefits = await this.extractBenefits();

      // Update salary if not found earlier
      if (!job.salary) {
        job.salary = await this.extractText(this.page, [
          '[data-test="salary"]',
          '.salary',
          '[class*="salary"]',
          '[class*="compensation"]',
        ]);
      }

      // Recheck for 1-Click Apply button on detail page
      const hasOneClickApply = await this.has1ClickApplyOnPage();

      return {
        ...job,
        description: description || 'No description available',
        requirements,
        benefits,
        hasOneClickApply: hasOneClickApply || job.hasOneClickApply || false,
      } as JobListing;
    } catch (error) {
      logger.error('Failed to parse job detail', { error, url: job.url });
      return null;
    }
  }

  /**
   * Extract job description
   */
  private async extractJobDescription(): Promise<string> {
    const selectors = [
      '[data-test="job-description"]',
      '.job_description',
      '[class*="description"]',
      '[class*="Description"]',
      'article',
      '[role="article"]',
    ];

    for (const selector of selectors) {
      try {
        const element = this.page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          const text = await element.innerText();
          if (text && text.length > 50) {
            return text.trim();
          }
        }
      } catch {
        continue;
      }
    }

    // Fallback: get all text from main content
    try {
      const mainContent = await this.page.locator('main, #main, [role="main"]').first();
      if (await mainContent.isVisible({ timeout: 1000 })) {
        return (await mainContent.innerText()).trim();
      }
    } catch {
      // Ignore
    }

    return '';
  }

  /**
   * Extract job requirements
   */
  private async extractRequirements(): Promise<string[] | undefined> {
    try {
      const requirements: string[] = [];

      // Look for sections with keywords
      const sectionSelectors = [
        '*:has-text("Requirements")',
        '*:has-text("Qualifications")',
        '*:has-text("Skills")',
        '*:has-text("You will need")',
      ];

      for (const selector of sectionSelectors) {
        try {
          const section = this.page.locator(selector).first();
          if (await section.isVisible({ timeout: 1000 })) {
            // Get bullet points or list items
            const listItems = await section.locator('li, p').all();
            for (const item of listItems) {
              const text = await item.innerText();
              if (text && text.length > 5 && text.length < 500) {
                requirements.push(text.trim());
              }
            }

            if (requirements.length > 0) break;
          }
        } catch {
          continue;
        }
      }

      return requirements.length > 0 ? requirements : undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Extract benefits
   */
  private async extractBenefits(): Promise<string[] | undefined> {
    try {
      const benefits: string[] = [];

      // Look for benefits section
      const sectionSelectors = [
        '*:has-text("Benefits")',
        '*:has-text("Perks")',
        '*:has-text("We offer")',
        '*:has-text("What we offer")',
      ];

      for (const selector of sectionSelectors) {
        try {
          const section = this.page.locator(selector).first();
          if (await section.isVisible({ timeout: 1000 })) {
            const listItems = await section.locator('li, p').all();
            for (const item of listItems) {
              const text = await item.innerText();
              if (text && text.length > 5 && text.length < 300) {
                benefits.push(text.trim());
              }
            }

            if (benefits.length > 0) break;
          }
        } catch {
          continue;
        }
      }

      return benefits.length > 0 ? benefits : undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Check if job has 1-Click Apply button
   */
  private async has1ClickApply(element: Locator | Page): Promise<boolean> {
    const selectors = [
      'button:has-text("1-Click Apply")',
      'button:has-text("Quick Apply")',
      'button:has-text("Easy Apply")',
      '[data-test="quick-apply"]',
      '[data-test="one-click-apply"]',
      'button[class*="QuickApply"]',
      'button[class*="quick-apply"]',
    ];

    for (const selector of selectors) {
      try {
        const button = element.locator(selector).first();
        if (await button.isVisible({ timeout: 500 })) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }

  /**
   * Check if page has 1-Click Apply button
   */
  private async has1ClickApplyOnPage(): Promise<boolean> {
    return this.has1ClickApply(this.page);
  }

  /**
   * Extract text from element using multiple selectors
   */
  private async extractText(element: Locator | Page, selectors: string[]): Promise<string | undefined> {
    for (const selector of selectors) {
      try {
        const locator = element.locator(selector).first();
        if (await locator.isVisible({ timeout: 500 })) {
          const text = await locator.innerText();
          if (text && text.trim()) {
            return text.trim();
          }
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  /**
   * Extract link from job card
   */
  private async extractLink(card: Locator): Promise<string | undefined> {
    try {
      // Try to find a link
      const link = card.locator('a[href*="/job/"]').first();
      if (await link.isVisible({ timeout: 500 })) {
        const href = await link.getAttribute('href');
        if (href) {
          // Make absolute URL if relative
          if (href.startsWith('/')) {
            return `https://www.ziprecruiter.com${href}`;
          }
          return href;
        }
      }
    } catch {
      // Ignore
    }

    return undefined;
  }

  /**
   * Generate a unique ID for a job
   */
  private generateJobId(title: string, company: string, url: string): string {
    const data = `${title}-${company}-${url}`.toLowerCase();
    return crypto.createHash('md5').update(data).digest('hex').substring(0, 12);
  }

  /**
   * Click on a job card to view details
   */
  async clickJobCard(card: Locator): Promise<void> {
    try {
      // Scroll to card
      await card.scrollIntoViewIfNeeded();
      await this.page.waitForTimeout(500);

      // Click the card
      await card.click();
      await pageLoadDelay();

      logger.debug('Clicked job card');
    } catch (error) {
      logger.error('Failed to click job card', { error });
      throw error;
    }
  }
}
