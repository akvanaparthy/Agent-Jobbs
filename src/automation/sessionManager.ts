import { BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { SessionData } from '../types';
import { PATHS } from '../config/constants';
import { logger } from '../utils/logger';

export class SessionManager {
  private sessionFile: string;

  constructor(sessionFile: string = PATHS.SESSION_FILE) {
    this.sessionFile = path.resolve(process.cwd(), sessionFile);
    this.ensureDirectoryExists();
  }

  /**
   * Ensure session directory exists
   */
  private ensureDirectoryExists(): void {
    const dir = path.dirname(this.sessionFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Check if a saved session exists
   */
  hasSession(): boolean {
    return fs.existsSync(this.sessionFile);
  }

  /**
   * Save session data from browser context
   */
  async saveSession(context: BrowserContext, page: Page): Promise<void> {
    try {
      // Get cookies
      const cookies = await context.cookies();

      // Get localStorage
      const localStorage = await page.evaluate(() => {
        const data: Record<string, string> = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            data[key] = window.localStorage.getItem(key) || '';
          }
        }
        return data;
      });

      // Get sessionStorage
      const sessionStorage = await page.evaluate(() => {
        const data: Record<string, string> = {};
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i);
          if (key) {
            data[key] = window.sessionStorage.getItem(key) || '';
          }
        }
        return data;
      });

      const sessionData: SessionData = {
        cookies,
        localStorage,
        sessionStorage,
        savedAt: new Date().toISOString(),
        // Set expiration to 30 days from now
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      fs.writeFileSync(this.sessionFile, JSON.stringify(sessionData, null, 2));
      logger.info('Session saved successfully', { file: this.sessionFile });
    } catch (error) {
      logger.error('Failed to save session', { error });
      throw error;
    }
  }

  /**
   * Load session data into browser context
   */
  async loadSession(context: BrowserContext, page: Page): Promise<boolean> {
    try {
      if (!this.hasSession()) {
        logger.warn('No saved session found');
        return false;
      }

      const data = fs.readFileSync(this.sessionFile, 'utf-8');
      const sessionData: SessionData = JSON.parse(data);

      // Check if session is expired
      if (sessionData.expiresAt && new Date(sessionData.expiresAt) < new Date()) {
        logger.warn('Saved session has expired');
        this.deleteSession();
        return false;
      }

      // Add cookies
      if (sessionData.cookies && sessionData.cookies.length > 0) {
        await context.addCookies(sessionData.cookies);
        logger.info(`Loaded ${sessionData.cookies.length} cookies`);
      }

      // Navigate to domain first to set localStorage/sessionStorage
      await page.goto('https://www.ziprecruiter.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });

      // Wait for Cloudflare challenge to complete
      logger.info('Waiting for Cloudflare challenge...');
      try {
        await page.waitForFunction(
          () => {
            const title = document.title;
            return !title.includes('Just a moment') &&
                   !title.includes('Checking your browser') &&
                   !document.querySelector('#challenge-running');
          },
          { timeout: 60000 }
        );
        logger.info('Cloudflare challenge passed');
      } catch (error) {
        logger.error('Cloudflare challenge timeout - session may be invalid');
        // Check if still on challenge page
        const title = await page.title();
        if (title.includes('Just a moment') || title.includes('Checking your browser')) {
          throw new Error('Failed to pass Cloudflare challenge - cannot load session');
        }
      }

      // Additional wait for page to stabilize
      await page.waitForTimeout(2000);

      // Set localStorage
      if (sessionData.localStorage) {
        await page.evaluate((data) => {
          Object.entries(data).forEach(([key, value]) => {
            window.localStorage.setItem(key, value);
          });
        }, sessionData.localStorage);
        logger.info(`Loaded ${Object.keys(sessionData.localStorage).length} localStorage items`);
      }

      // Set sessionStorage
      if (sessionData.sessionStorage) {
        await page.evaluate((data) => {
          Object.entries(data).forEach(([key, value]) => {
            window.sessionStorage.setItem(key, value);
          });
        }, sessionData.sessionStorage);
        logger.info(`Loaded ${Object.keys(sessionData.sessionStorage).length} sessionStorage items`);
      }

      logger.info('Session loaded successfully', {
        savedAt: sessionData.savedAt,
        expiresAt: sessionData.expiresAt,
      });

      return true;
    } catch (error) {
      logger.error('Failed to load session', { error });
      return false;
    }
  }

  /**
   * Validate if session is still valid
   */
  async validateSession(page: Page): Promise<boolean> {
    try {
      // Navigate to a page that requires authentication
      await page.goto('https://www.ziprecruiter.com/candidate/suggested-jobs', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // Wait for Cloudflare challenge to complete if present
      logger.info('Checking for Cloudflare challenge...');
      try {
        await page.waitForFunction(
          () => {
            const title = document.title;
            return !title.includes('Just a moment') && 
                   !title.includes('Checking your browser') &&
                   !document.querySelector('#challenge-running');
          },
          { timeout: 30000 }
        );
        logger.info('No Cloudflare challenge or passed successfully');
      } catch (error) {
        logger.warn('Cloudflare challenge timeout - may be stuck');
        // Check if we're actually blocked
        const title = await page.title();
        if (title.includes('Just a moment')) {
          logger.error('Stuck on Cloudflare challenge - please solve manually');
          // Wait longer for manual intervention
          await page.waitForTimeout(60000);
        }
      }

      // Wait a bit for any redirects
      await page.waitForTimeout(2000);

      // Check if we're redirected to login
      const url = page.url();
      logger.info('Current URL after navigation', { url });
      
      if (url.includes('/login') || url.includes('/sign-in')) {
        logger.warn('Session is invalid - redirected to login');
        return false;
      }

      // Check for elements and text that indicate logged-in state
      const debugInfo = await page.evaluate(() => {
        // Look for a broader set of logged-in indicators
        const selectors: Record<string, string> = {
          userMenu: '[data-test="user-menu"]',
          userProfile: '.user-profile',
          profileAria: '[aria-label="Profile"]',
          profileMenu: '[data-testid="profile-menu"]',
          accountMenu: '[data-testid="account-menu"]',
          userAvatar: '.user-avatar',
          accountButton: 'button[aria-label*="Account"]',
          candidateLink: 'a[href*="/candidate/"]',
          jobCard: '[data-testid="job-listing"], .job-card, [class*="job"]',
        };

        const found: Record<string, boolean> = {};
        Object.entries(selectors).forEach(([key, selector]) => {
          try {
            found[key] = document.querySelector(selector) !== null;
          } catch (e) {
            found[key] = false;
          }
        });

        // Text-based fuzzy checks for UI labels that often appear when logged in
        const textCandidates = Array.from(document.querySelectorAll('a,button,span')).map(el => (el.textContent || '').trim()).filter(Boolean);
        const hasMyJobs = textCandidates.some(t => /(my jobs|applications|dashboard|profile|sign out|log out|account)/i.test(t));

        const title = document.title || '';
        const bodySnippet = (document.body && document.body.innerText) ? document.body.innerText.slice(0, 1200) : '';

        return {
          found,
          title,
          hasJobListings: document.querySelector(selectors.jobCard) !== null,
          hasMyJobs,
          bodySnippet,
        };
      });

      // Log debug info (bodySnippet truncated) and cookie names will be logged below
      logger.info('Page validation debug info', {
        title: debugInfo.title,
        found: debugInfo.found,
        hasJobListings: debugInfo.hasJobListings,
        hasMyJobs: debugInfo.hasMyJobs,
      });

      // Inspect cookies for session-like names (helps detect logged-in state)
      let cookieNames: string[] = [];
      try {
        const cookies = await page.context().cookies();
        cookieNames = cookies.map(c => c.name);
        logger.info('Session cookies present', { cookieNames });
      } catch (err) {
        logger.warn('Could not read cookies during session validation', { error: err });
      }

      const hasSessionCookie = cookieNames.some(n => /session|ziprecruiter|auth|sid/i.test(n));

      const isLoggedIn = Object.values(debugInfo.found).some(v => v) || 
                        debugInfo.hasJobListings ||
                        debugInfo.hasMyJobs ||
                        url.includes('/candidate/') ||
                        hasSessionCookie;

      if (isLoggedIn) {
        logger.info('Session is valid');
        return true;
      } else {
        logger.warn('Session appears invalid - no logged-in indicators found');
        return false;
      }
    } catch (error) {
      logger.error('Failed to validate session', { error });
      return false;
    }
  }

  /**
   * Delete saved session
   */
  deleteSession(): void {
    try {
      if (fs.existsSync(this.sessionFile)) {
        fs.unlinkSync(this.sessionFile);
        logger.info('Session deleted');
      }
    } catch (error) {
      logger.error('Failed to delete session', { error });
    }
  }

  /**
   * Get session info
   */
  getSessionInfo(): SessionData | null {
    try {
      if (!this.hasSession()) {
        return null;
      }

      const data = fs.readFileSync(this.sessionFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to read session info', { error });
      return null;
    }
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
