import { chromium, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(process.cwd(), 'data', 'logs', `ziprecruiter-monitor-${Date.now()}.log`);
const PROFILE_DIR = path.join(process.cwd(), 'playwright-profile');

// Ensure log directory exists
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

function log(event: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    data
  };

  const logLine = `[${timestamp}] ${event}${data ? ': ' + JSON.stringify(data, null, 2) : ''}\n`;
  fs.appendFileSync(LOG_FILE, logLine);
  console.log(logLine.trim());
}

async function attachPageListeners(page: Page) {
  // Console messages
  page.on('console', msg => {
    log('CONSOLE', {
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
  });

  // Dialogs (alerts, confirms, prompts)
  page.on('dialog', dialog => {
    log('DIALOG', {
      type: dialog.type(),
      message: dialog.message(),
      defaultValue: dialog.defaultValue()
    });
    dialog.dismiss().catch(() => {});
  });

  // Page errors
  page.on('pageerror', error => {
    log('PAGE_ERROR', {
      message: error.message,
      stack: error.stack
    });
  });

  // Request/Response monitoring
  page.on('request', request => {
    log('REQUEST', {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      headers: request.headers()
    });
  });

  page.on('response', response => {
    log('RESPONSE', {
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      headers: response.headers()
    });
  });

  // Network request failures
  page.on('requestfailed', request => {
    log('REQUEST_FAILED', {
      url: request.url(),
      failure: request.failure()
    });
  });

  // Popup windows
  page.on('popup', async popup => {
    log('POPUP_OPENED', {
      url: popup.url()
    });

    // Attach listeners to popup too
    await attachPageListeners(popup);
  });

  // Downloads
  page.on('download', download => {
    log('DOWNLOAD', {
      url: download.url(),
      suggestedFilename: download.suggestedFilename()
    });
  });

  // Worker creation
  page.on('worker', worker => {
    log('WORKER_CREATED', {
      url: worker.url()
    });
  });

  // Frame navigation
  page.on('framenavigated', frame => {
    log('FRAME_NAVIGATED', {
      url: frame.url(),
      name: frame.name(),
      isMainFrame: frame === page.mainFrame()
    });
  });

  // Load events
  page.on('load', () => {
    log('PAGE_LOAD', { url: page.url() });
  });

  page.on('domcontentloaded', () => {
    log('DOM_CONTENT_LOADED', { url: page.url() });
  });
}

async function attachContextListeners(context: BrowserContext) {
  // New pages
  context.on('page', async page => {
    log('NEW_PAGE', { url: page.url() });
    await attachPageListeners(page);
  });

  // Background pages (service workers, etc.)
  context.on('backgroundpage', page => {
    log('BACKGROUND_PAGE', { url: page.url() });
  });

  // Service workers
  context.on('serviceworker', worker => {
    log('SERVICE_WORKER', { url: worker.url() });
  });
}

async function monitorDOMChanges(page: Page) {
  await page.evaluate(() => {
    // Monitor DOM mutations
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) { // Element node
              const element = node as Element;
              console.log('[DOM_MUTATION] Node added:', {
                tag: element.tagName,
                id: element.id,
                classes: element.className,
                text: element.textContent?.substring(0, 100)
              });
            }
          });

          mutation.removedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              const element = node as Element;
              console.log('[DOM_MUTATION] Node removed:', {
                tag: element.tagName,
                id: element.id,
                classes: element.className
              });
            }
          });
        }

        if (mutation.type === 'attributes') {
          const element = mutation.target as Element;
          console.log('[DOM_MUTATION] Attribute changed:', {
            tag: element.tagName,
            id: element.id,
            attribute: mutation.attributeName,
            newValue: element.getAttribute(mutation.attributeName!)
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true
    });

    console.log('[DOM_MONITOR] MutationObserver attached');
  });
}

async function monitorModals(page: Page) {
  // Check for modals/popups every 500ms
  setInterval(async () => {
    try {
      const modals = await page.evaluate(() => {
        const modalSelectors = [
          '[role="dialog"]',
          '.modal',
          '.popup',
          '[class*="Modal"]',
          '[class*="Dialog"]',
          '[class*="Popup"]'
        ];

        const found: any[] = [];
        modalSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              found.push({
                selector,
                id: el.id,
                classes: el.className,
                visible: true,
                innerHTML: el.innerHTML.substring(0, 200)
              });
            }
          });
        });

        return found;
      });

      if (modals.length > 0) {
        log('MODALS_DETECTED', modals);
      }
    } catch (error) {
      // Ignore errors during monitoring
    }
  }, 500);
}

async function main() {
  log('STARTING_MONITOR', { logFile: LOG_FILE });

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 720 },
    slowMo: 100,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  log('BROWSER_LAUNCHED', {
    profileDir: PROFILE_DIR,
    pages: browser.pages().length
  });

  // Attach context-level listeners
  await attachContextListeners(browser);

  // Get or create first page
  let page = browser.pages()[0];
  if (!page) {
    page = await browser.newPage();
  }

  // Attach page-level listeners
  await attachPageListeners(page);

  log('NAVIGATING_TO_ZIPRECRUITER');
  await page.goto('https://www.ziprecruiter.com', { waitUntil: 'domcontentloaded' });

  log('PAGE_LOADED', { url: page.url() });

  // Monitor DOM changes
  await monitorDOMChanges(page);

  // Monitor for modals
  await monitorModals(page);

  // Take periodic snapshots
  setInterval(async () => {
    try {
      const url = page.url();
      const title = await page.title();
      const formElements = await page.evaluate(() => ({
        inputs: document.querySelectorAll('input').length,
        textareas: document.querySelectorAll('textarea').length,
        selects: document.querySelectorAll('select').length,
        buttons: document.querySelectorAll('button').length
      }));

      log('SNAPSHOT', {
        url,
        title,
        formElements
      });
    } catch (error) {
      // Ignore
    }
  }, 5000);

  console.log('\n===========================================');
  console.log('Browser is ready for manual interaction');
  console.log('All events are being logged to:', LOG_FILE);
  console.log('===========================================\n');
  console.log('Instructions:');
  console.log('1. Search for a keyword');
  console.log('2. Find a job with "1-Click Apply"');
  console.log('3. Click on "1-Click Apply"');
  console.log('4. Observe what happens');
  console.log('\nPress Ctrl+C to stop monitoring\n');

  // Keep the script running
  await new Promise(() => {});
}

main().catch(error => {
  log('FATAL_ERROR', {
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});
