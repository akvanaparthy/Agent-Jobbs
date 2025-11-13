import { Browser, BrowserContext, Page } from 'playwright';
import { USER_AGENTS } from '../config/constants';

/**
 * Get a random user agent
 */
export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Apply stealth techniques to a browser context
 */
export async function applyStealthTechniques(context: BrowserContext): Promise<void> {
  // Add init script to mask automation
  await context.addInitScript(() => {
    // Override the `navigator.webdriver` property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Override the `plugins` property to add fake plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        {
          0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
          description: 'Portable Document Format',
          filename: 'internal-pdf-viewer',
          length: 1,
          name: 'Chrome PDF Plugin',
        },
        {
          0: { type: 'application/pdf', suffixes: 'pdf', description: '' },
          description: '',
          filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
          length: 1,
          name: 'Chrome PDF Viewer',
        },
      ],
    });

    // Override the `languages` property
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // Mock permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: 'denied' } as PermissionStatus)
        : originalQuery(parameters);

    // Add chrome object
    (window as any).chrome = {
      runtime: {},
      loadTimes: function () { },
      csi: function () { },
      app: {},
    };

    // Override the `platform` property if needed
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32',
    });
  });
}

/**
 * Create context with stealth options
 */
export async function createStealthContext(
  browser: Browser,
  options: {
    userAgent?: string;
    viewport?: { width: number; height: number };
    locale?: string;
  } = {}
): Promise<BrowserContext> {
  const userAgent = options.userAgent || getRandomUserAgent();
  const viewport = options.viewport || { width: 1920, height: 1080 };
  const locale = options.locale || 'en-US';

  const context = await browser.newContext({
    userAgent,
    viewport,
    locale,
    timezoneId: 'America/New_York',
    permissions: [],
    colorScheme: 'light',
    // Extra HTTP headers
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  // Apply stealth techniques
  await applyStealthTechniques(context);

  return context;
}

/**
 * Add random noise to mouse movements
 */
export function addMouseNoise(x: number, y: number, maxNoise: number = 5): { x: number; y: number } {
  const noiseX = (Math.random() - 0.5) * maxNoise * 2;
  const noiseY = (Math.random() - 0.5) * maxNoise * 2;

  return {
    x: x + noiseX,
    y: y + noiseY,
  };
}

/**
 * Simulate human-like page load behavior
 */
export async function simulatePageLoad(page: Page): Promise<void> {
  // Wait for page to be somewhat loaded
  await page.waitForLoadState('domcontentloaded');

  // Simulate reading the page title
  await page.waitForTimeout(500 + Math.random() * 1000);

  // Small random scroll
  await page.evaluate(() => {
    window.scrollBy(0, Math.random() * 200);
  });

  await page.waitForTimeout(300 + Math.random() * 700);

  // Wait for network to be mostly idle
  await page.waitForLoadState('networkidle').catch(() => {
    // Ignore timeout, continue anyway
  });
}
