import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { createStealthContext } from './stealth';
import { sessionManager } from './sessionManager';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isPersistent: boolean = false;

  /**
   * Launch browser and create context
   */
  async launch(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    try {
      logger.info('Launching browser...', {
        headless: config.headless,
        persistent: config.usePersistentContext,
      });

      if (config.usePersistentContext) {
        /**
         * PERSISTENT CONTEXT MODE (Recommended)
         *
         * Uses a real browser profile saved to disk (data/browser-profile/).
         * This provides several advantages:
         *
         * 1. Cloudflare Challenge Bypass:
         *    - Cookies persist between runs, so Cloudflare recognizes the "browser"
         *    - No need to solve challenges repeatedly
         *
         * 2. Minimal Stealth Needed:
         *    - Real browser fingerprints (stored in profile) are more convincing than fake ones
         *    - No need for heavy navigator.webdriver masking
         *    - Chrome args (--disable-blink-features) provide basic automation hiding
         *
         * 3. Behavioral Detection Prevention:
         *    - Human-like delays (2-5 seconds) in humanBehavior.ts are still essential
         *    - Timing-based detection can still catch bots regardless of fingerprints
         *
         * Note: This does NOT call applyStealthTechniques() because:
         * - The browser profile already has consistent fingerprints
         * - Fake navigator properties would conflict with the real stored profile
         * - Chrome args provide sufficient automation detection hiding
         */
        const userDataDir = path.resolve(process.cwd(), 'data', 'browser-profile');

        this.context = await chromium.launchPersistentContext(userDataDir, {
          headless: config.headless,
          args: [
            '--disable-blink-features=AutomationControlled', // Primary automation detection hiding
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-infobars',
            '--window-size=1920,1080',
            '--no-sandbox',
            '--disable-setuid-sandbox',
          ],
          ignoreDefaultArgs: ['--enable-automation'], // Remove automation flag
          viewport: { width: 1920, height: 1080 },
        });

        this.isPersistent = true;
        this.page = this.context.pages()[0] || await this.context.newPage();
        this.page.setDefaultTimeout(config.browserTimeout);

        logger.info('Browser launched with persistent context (minimal stealth needed)');

        return {
          browser: null as any, // Persistent context doesn't have separate browser object
          context: this.context,
          page: this.page,
        };
      } else {
        /**
         * NON-PERSISTENT CONTEXT MODE (Fallback)
         *
         * Used when persistent profile is not available or for testing.
         * Requires FULL stealth measures:
         *
         * 1. Chrome args to hide automation
         * 2. applyStealthTechniques() to mask navigator.webdriver and other bot signals
         * 3. Human-like delays (same as persistent mode)
         *
         * Drawbacks:
         * - Cloudflare challenges must be solved every run
         * - More complex stealth scripts needed
         * - Less "real" than persistent profile
         */
        this.browser = await chromium.launch({
          headless: config.headless,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-infobars',
            '--window-size=1920,1080',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials',
            '--disable-features=BlockInsecurePrivateNetworkRequests',
          ],
          ignoreDefaultArgs: ['--enable-automation'],
        });

        // Create stealth context with navigator masking (needed without persistent profile)
        this.context = await createStealthContext(this.browser);
        this.page = await this.context.newPage();
        this.page.setDefaultTimeout(config.browserTimeout);

        logger.info('Browser launched with non-persistent context (full stealth applied)');

        return {
          browser: this.browser,
          context: this.context,
          page: this.page,
        };
      }
    } catch (error) {
      logger.error('Failed to launch browser', { error });
      throw error;
    }
  }

  /**
   * Get current page
   */
  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return this.page;
  }

  /**
   * Get current context
   */
  getContext(): BrowserContext {
    if (!this.context) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return this.context;
  }

  /**
   * Get current browser
   */
  getBrowser(): Browser {
    if (this.isPersistent) {
      throw new Error('getBrowser() not available in persistent context mode. Use getContext() or getPage() instead.');
    }
    if (!this.browser) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return this.browser;
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }

      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      logger.info('Browser closed');
    } catch (error) {
      logger.error('Error closing browser', { error });
    }
  }

  /**
   * Load session if available
   */
  async loadSession(): Promise<boolean> {
    if (!this.context || !this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    const loaded = await sessionManager.loadSession(this.context, this.page);

    if (loaded) {
      // Validate session
      const isValid = await sessionManager.validateSession(this.page);
      if (!isValid) {
        logger.warn('Loaded session is not valid');
        sessionManager.deleteSession();
        return false;
      }
    }

    return loaded;
  }

  /**
   * Save current session
   */
  async saveSession(): Promise<void> {
    if (!this.context || !this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    await sessionManager.saveSession(this.context, this.page);
  }

  /**
   * Navigate to URL with retry
   */
  async navigate(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void> {
    const page = this.getPage();

    try {
      await page.goto(url, {
        waitUntil: options?.waitUntil || 'domcontentloaded',
        timeout: config.browserTimeout,
      });

      logger.info('Navigated to URL', { url });
    } catch (error) {
      logger.error('Navigation failed', { url, error });
      throw error;
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(filename: string, fullPage: boolean = false): Promise<void> {
    const page = this.getPage();

    try {
      await page.screenshot({
        path: filename,
        fullPage,
      });

      logger.info('Screenshot saved', { filename });
    } catch (error) {
      logger.error('Failed to take screenshot', { error });
    }
  }

  /**
   * Check for CAPTCHA
   */
  async detectCaptcha(): Promise<boolean> {
    const page = this.getPage();

    try {
      const captchaSelectors = [
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        '.g-recaptcha',
        '#captcha',
        '[data-captcha]',
      ];

      for (const selector of captchaSelectors) {
        const element = await page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          logger.warn('CAPTCHA detected!', { selector });
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for 403 or blocking
   */
  async detectBlocking(): Promise<boolean> {
    const page = this.getPage();

    try {
      const title = await page.title();
      const content = await page.content();

      const blockingIndicators = [
        'access denied',
        'forbidden',
        '403',
        'blocked',
        'not authorized',
        'suspicious activity',
      ];

      const isBlocked = blockingIndicators.some(
        indicator =>
          title.toLowerCase().includes(indicator) ||
          content.toLowerCase().includes(indicator)
      );

      if (isBlocked) {
        logger.warn('Blocking detected!', { title, url: page.url() });
      }

      return isBlocked;
    } catch (error) {
      return false;
    }
  }

  /**
   * Wait for element with retry
   */
  async waitForElement(selector: string, timeout?: number): Promise<void> {
    const page = this.getPage();
    await page.waitForSelector(selector, { timeout: timeout || config.browserTimeout });
  }
}

// Export singleton instance
export const browserManager = new BrowserManager();
