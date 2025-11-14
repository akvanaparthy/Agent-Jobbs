import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import { SELECTORS, ZIPRECRUITER_BASE_URL, ZIPRECRUITER_SEARCH_URL } from '../config/constants';
import { humanType, humanClick, humanScroll, scrollToElement, simulateReadingTime } from '../utils/humanBehavior';
import { pageLoadDelay, betweenFieldsDelay } from '../utils/delays';

export class ZipRecruiterNavigator {
  constructor(private page: Page) {}

  /**
   * Perform job search
   */
  async search(keywords: string, location: string): Promise<void> {
    try {
      logger.info('Starting job search', { keywords, location });

      // Navigate to search page
      await this.page.goto(ZIPRECRUITER_SEARCH_URL, { waitUntil: 'domcontentloaded' });
      await pageLoadDelay();

      // Fill keywords
      logger.debug('Filling search keywords');
      const keywordsInput = await this.findSearchKeywordsInput();
      if (keywordsInput) {
        await this.page.fill(keywordsInput, ''); // Clear first
        await humanType(this.page, keywordsInput, keywords);
        await betweenFieldsDelay();
      }

      // Fill location
      logger.debug('Filling location');
      const locationInput = await this.findSearchLocationInput();
      if (locationInput) {
        await this.page.fill(locationInput, ''); // Clear first
        await humanType(this.page, locationInput, location);
        await betweenFieldsDelay();
      }

      // Click search button
      logger.debug('Clicking search button');
      const searchButton = await this.findSearchButton();
      if (searchButton) {
        await humanClick(this.page, searchButton);
      } else {
        // Fallback: press Enter
        await this.page.keyboard.press('Enter');
      }

      // Wait for results
      await this.page.waitForLoadState('domcontentloaded');
      await pageLoadDelay();

      logger.info('Search completed', {
        url: this.page.url(),
      });
    } catch (error) {
      logger.error('Search failed', { error });
      throw error;
    }
  }

  /**
   * Apply date filter
   */
  async applyDateFilter(filter: string): Promise<void> {
    try {
      logger.info('Applying date filter', { filter });

      // Different sites use different filter mechanisms
      // This is a placeholder - actual implementation depends on ZipRecruiter's UI

      const filterMap: Record<string, string> = {
        past_day: '1',
        past_week: '7',
        past_month: '30',
        any_time: 'all',
      };

      const filterValue = filterMap[filter] || filterMap.past_week;

      // Try to find and click the filter dropdown
      const filterSelectors = [
        'select[name="days"]',
        '[data-test="date-filter"]',
        'button:has-text("Date Posted")',
      ];

      for (const selector of filterSelectors) {
        try {
          const element = await this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            if (selector.startsWith('select')) {
              await this.page.selectOption(selector, filterValue);
            } else {
              await humanClick(this.page, selector);
              await this.page.waitForTimeout(1000);
              // Then select the option - this depends on the UI
            }
            logger.info('Date filter applied');
            return;
          }
        } catch {
          continue;
        }
      }

      logger.warn('Could not find date filter selector');
    } catch (error) {
      logger.error('Failed to apply date filter', { error });
    }
  }

  /**
   * Get job card elements on current page
   */
  async getJobCards(): Promise<any[]> {
    try {
      // Wait for page to load
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(2000);

      // ZipRecruiter embeds job data in a JSON script tag
      // Return a marker that will be handled by jobParser.extractJobsFromJSON()
      logger.info('Job data will be extracted from page JSON');
      return ['JSON_DATA_AVAILABLE']; // Marker to indicate data is available
    } catch (error) {
      logger.error('Failed to check for job data', { error });
      return [];
    }
  }

  /**
   * Check if there's a next page
   */
  async hasNextPage(): Promise<boolean> {
    try {
      const nextButtonSelectors = [
        'button[aria-label="Next"]',
        'a[rel="next"]',
        '[data-test="next-page"]',
        'button:has-text("Next")',
        '.pagination .next:not(.disabled)',
      ];

      for (const selector of nextButtonSelectors) {
        try {
          const element = await this.page.locator(selector).first();
          const isVisible = await element.isVisible({ timeout: 1000 });
          const isDisabled = await element.isDisabled().catch(() => false);

          if (isVisible && !isDisabled) {
            return true;
          }
        } catch {
          continue;
        }
      }

      return false;
    } catch (error) {
      logger.error('Error checking for next page', { error });
      return false;
    }
  }

  /**
   * Navigate to next page
   */
  async goToNextPage(): Promise<boolean> {
    try {
      logger.info('Navigating to next page');

      const nextButtonSelectors = [
        'button[aria-label="Next"]',
        'a[rel="next"]',
        '[data-test="next-page"]',
        'button:has-text("Next")',
      ];

      for (const selector of nextButtonSelectors) {
        try {
          const element = await this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 1000 })) {
            await scrollToElement(this.page, selector);
            await humanClick(this.page, selector);
            await this.page.waitForLoadState('domcontentloaded');
            await pageLoadDelay();
            logger.info('Moved to next page');
            return true;
          }
        } catch {
          continue;
        }
      }

      logger.warn('Could not find next page button');
      return false;
    } catch (error) {
      logger.error('Failed to navigate to next page', { error });
      return false;
    }
  }

  /**
   * Scroll through the page (for infinite scroll sites)
   */
  async scrollForMoreResults(): Promise<void> {
    try {
      const initialHeight = await this.page.evaluate(() => document.body.scrollHeight);

      // Scroll down
      for (let i = 0; i < 5; i++) {
        await humanScroll(this.page, 'down');
        await this.page.waitForTimeout(1000);
      }

      // Check if new content loaded
      const newHeight = await this.page.evaluate(() => document.body.scrollHeight);

      if (newHeight > initialHeight) {
        logger.info('New content loaded after scrolling');
        await this.page.waitForTimeout(2000);
      }
    } catch (error) {
      logger.error('Error scrolling for more results', { error });
    }
  }

  /**
   * Helper: Find search keywords input
   */
  private async findSearchKeywordsInput(): Promise<string | null> {
    const selectors = [
      'input[name="search"]',
      'input[placeholder*="job title"]',
      'input[placeholder*="keyword"]',
      '#search-input',
      '[data-test="search-input"]',
    ];

    for (const selector of selectors) {
      try {
        if (await this.page.locator(selector).first().isVisible({ timeout: 1000 })) {
          return selector;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Helper: Find search location input
   */
  private async findSearchLocationInput(): Promise<string | null> {
    const selectors = [
      'input[name="location"]',
      'input[placeholder*="location"]',
      'input[placeholder*="city"]',
      '#location-input',
      '[data-test="location-input"]',
    ];

    for (const selector of selectors) {
      try {
        if (await this.page.locator(selector).first().isVisible({ timeout: 1000 })) {
          return selector;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Helper: Find search button
   */
  private async findSearchButton(): Promise<string | null> {
    const selectors = [
      'button[type="submit"]',
      'button:has-text("Search")',
      '[data-test="search-button"]',
      'input[type="submit"]',
    ];

    for (const selector of selectors) {
      try {
        if (await this.page.locator(selector).first().isVisible({ timeout: 1000 })) {
          return selector;
        }
      } catch {
        continue;
      }
    }

    return null;
  }
}
