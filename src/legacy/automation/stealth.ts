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

    // Override webdriver in multiple ways
    delete (navigator as any).__proto__.webdriver;

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
        {
          0: { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },
          description: 'Native Client Executable',
          filename: 'internal-nacl-plugin',
          length: 2,
          name: 'Native Client',
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

    // Add chrome object with more realistic properties
    (window as any).chrome = {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      },
      runtime: {
        OnInstalledReason: {
          CHROME_UPDATE: 'chrome_update',
          INSTALL: 'install',
          SHARED_MODULE_UPDATE: 'shared_module_update',
          UPDATE: 'update',
        },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
        RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
      },
      loadTimes: function () { },
      csi: function () { },
    };

    // Override the `platform` property
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32',
    });

    // Hide automation indicators
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
    });

    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
    });

    // Override automation detection
    (window as any).Notification = {
      permission: 'default',
    };

    // Overwrite the `call` method on the Function prototype
    const originalCall = Function.prototype.call;
    Function.prototype.call = function () {
      const args = Array.from(arguments);
      if (
        args &&
        args.length > 0 &&
        args[0] &&
        args[0].toString &&
        args[0].toString() === '[object NavigatorUAData]'
      ) {
        return undefined;
      }
      return originalCall.apply(this, arguments as any);
    };

    // Mock other common detection methods
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: () => 0,
    });

    // Make the toString functions appear native
    const toStringNative = (func: Function) => {
      const oldToString = Function.prototype.toString;
      Function.prototype.toString = function () {
        if (this === func) {
          return 'function () { [native code] }';
        }
        return oldToString.call(this);
      };
    };

    toStringNative(navigator.permissions.query);
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
    colorScheme: 'light',
    // Use Playwright's default headers (more natural)
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  // Apply stealth techniques
  await applyStealthTechniques(context);

  return context;
}

/**
 * REMOVED FUNCTIONS (Dead Code):
 *
 * - addMouseNoise(): Redundant with humanClick() in humanBehavior.ts (already does random positioning)
 * - simulatePageLoad(): Never called in codebase; Playwright's waitForLoadState() is sufficient
 *
 * If you need these functions, use:
 * - For mouse noise: See humanClick() in src/utils/humanBehavior.ts (line 28)
 * - For page load: Use page.waitForLoadState('networkidle') directly
 */
