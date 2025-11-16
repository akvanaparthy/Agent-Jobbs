import { chromium, Page, Route } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(process.cwd(), 'data', 'logs', `api-flow-${Date.now()}.log`);
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

  const logLine = `\n${'='.repeat(80)}\n[${timestamp}] ${event}\n${data ? JSON.stringify(data, null, 2) : ''}\n${'='.repeat(80)}\n`;
  fs.appendFileSync(LOG_FILE, logLine);
  console.log(`[${timestamp}] ${event}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

async function interceptRequests(page: Page) {
  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    // Only intercept apply/interview API calls
    if (url.includes('/apply/api/v2/interview') || url.includes('/apply') && url.includes('interview')) {
      log(`${method} REQUEST`, {
        url,
        method,
        headers: request.headers(),
        postData: request.postData() // Capture request body
      });

      // Continue the request and capture response
      try {
        const response = await route.fetch();
        const body = await response.text();

        let parsedBody;
        try {
          parsedBody = JSON.parse(body);
        } catch {
          parsedBody = body; // If not JSON, log as text
        }

        log(`${method} RESPONSE`, {
          url,
          status: response.status(),
          headers: response.headers(),
          body: parsedBody // Capture response body
        });

        // Send the response back to the browser
        await route.fulfill({
          response,
          body
        });
      } catch (error: any) {
        log('ROUTE_ERROR', {
          url,
          error: error.message
        });
        await route.continue();
      }
    } else {
      // Don't intercept other requests
      await route.continue();
    }
  });

  // Also log console messages for debugging
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('interview') || text.includes('apply') || text.includes('question')) {
      log('CONSOLE', {
        type: msg.type(),
        text
      });
    }
  });

  // Log dialogs
  page.on('dialog', dialog => {
    log('DIALOG', {
      type: dialog.type(),
      message: dialog.message()
    });
    dialog.dismiss().catch(() => {});
  });

  // Log page navigations
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      log('PAGE_NAVIGATED', {
        url: frame.url()
      });
    }
  });
}

// Monitor for modals
async function monitorModals(page: Page) {
  setInterval(async () => {
    try {
      const modals = await page.evaluate(() => {
        const dialogElements = document.querySelectorAll('[role="dialog"]');
        const results: any[] = [];

        dialogElements.forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            // Check if it's the apply modal
            const isApplyModal = el.className.includes('ApplyFlowApp') ||
                                el.className.includes('interview');

            if (isApplyModal) {
              // Try to extract form fields
              const inputs = el.querySelectorAll('input, textarea, select');
              const fields: any[] = [];

              inputs.forEach(input => {
                const element = input as HTMLInputElement;
                fields.push({
                  tag: element.tagName.toLowerCase(),
                  type: element.type,
                  name: element.name,
                  id: element.id,
                  placeholder: element.placeholder,
                  required: element.required,
                  value: element.value
                });
              });

              // Try to find the Continue/Next/Submit button
              const buttons = el.querySelectorAll('button');
              const buttonTexts: string[] = [];
              buttons.forEach(btn => {
                const text = btn.textContent?.trim();
                if (text) buttonTexts.push(text);
              });

              results.push({
                className: el.className,
                fields,
                buttons: buttonTexts,
                visible: true
              });
            }
          }
        });

        return results;
      });

      if (modals.length > 0) {
        log('MODAL_STATE', modals);
      }
    } catch (error) {
      // Ignore errors during monitoring
    }
  }, 2000); // Check every 2 seconds
}

async function main() {
  log('MONITORING_STARTED', { logFile: LOG_FILE });

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 720 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  log('BROWSER_LAUNCHED');

  // Get or create first page
  let page = browser.pages()[0];
  if (!page) {
    page = await browser.newPage();
  }

  // Set up request interception
  await interceptRequests(page);

  // Navigate to ZipRecruiter
  log('NAVIGATING_TO_ZIPRECRUITER');
  await page.goto('https://www.ziprecruiter.com/jobs-search?search=ai+engineer&location=', {
    waitUntil: 'domcontentloaded'
  });

  log('PAGE_LOADED', { url: page.url() });

  // Start monitoring modals
  await monitorModals(page);

  console.log('\n' + '='.repeat(80));
  console.log('🔍 API FLOW MONITORING ACTIVE');
  console.log('='.repeat(80));
  console.log('\nLogging to:', LOG_FILE);
  console.log('\nInstructions:');
  console.log('1. Search for jobs (or use current search results)');
  console.log('2. Click on a job with "1-Click Apply"');
  console.log('3. Click "1-Click Apply" button');
  console.log('4. Fill out any questions that appear');
  console.log('5. Click Continue/Submit');
  console.log('6. Repeat for 1-2 more jobs (one with no questions if possible)');
  console.log('\n📋 Watching for:');
  console.log('   - /apply/api/v2/interview API calls');
  console.log('   - Request/response bodies (full JSON)');
  console.log('   - Modal form fields');
  console.log('   - Button states');
  console.log('\nPress Ctrl+C when done\n');
  console.log('='.repeat(80) + '\n');

  // Keep script running
  await new Promise(() => {});
}

main().catch(error => {
  log('FATAL_ERROR', {
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});
