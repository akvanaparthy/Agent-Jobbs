import { chromium, Page, CDPSession } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(process.cwd(), 'data', 'logs', `api-passive-${Date.now()}.log`);
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
  if (data && event.includes('INTERVIEW')) {
    console.log(JSON.stringify(data, null, 2));
  }
}

async function setupPassiveMonitoring(page: Page) {
  // Create CDP session for low-level network monitoring
  const client: CDPSession = await page.context().newCDPSession(page);

  // Enable network tracking
  await client.send('Network.enable');

  // Storage for request/response mapping
  const requestMap = new Map<string, any>();

  // Listen to request events
  client.on('Network.requestWillBeSent', (params) => {
    const url = params.request.url;

    // Only log apply/interview API calls
    if (url.includes('/apply/api/v2/interview')) {
      requestMap.set(params.requestId, {
        url,
        method: params.request.method,
        headers: params.request.headers,
        postData: params.request.postData,
        timestamp: params.timestamp
      });

      log('API_REQUEST', {
        url,
        method: params.request.method,
        headers: params.request.headers,
        postData: params.request.postData ? JSON.parse(params.request.postData) : undefined
      });
    }
  });

  // Listen to response events
  client.on('Network.responseReceived', async (params) => {
    const url = params.response.url;

    // Only log apply/interview API calls
    if (url.includes('/apply/api/v2/interview')) {
      const request = requestMap.get(params.requestId);

      log('API_RESPONSE_HEADERS', {
        url,
        status: params.response.status,
        statusText: params.response.statusText,
        headers: params.response.headers,
        mimeType: params.response.mimeType,
        requestMethod: request?.method
      });

      // Try to get response body
      try {
        const responseBody = await client.send('Network.getResponseBody', {
          requestId: params.requestId
        });

        let parsedBody;
        try {
          parsedBody = JSON.parse(responseBody.body);
        } catch {
          parsedBody = responseBody.body;
        }

        log('API_RESPONSE_BODY', {
          url,
          method: request?.method,
          status: params.response.status,
          body: parsedBody
        });
      } catch (error: any) {
        // Some responses might not have a body or might not be available yet
        log('RESPONSE_BODY_ERROR', {
          url,
          error: error.message
        });
      }

      // Clean up
      requestMap.delete(params.requestId);
    }
  });

  // Listen to request failures
  client.on('Network.loadingFailed', (params) => {
    const request = requestMap.get(params.requestId);
    if (request && request.url.includes('/apply/api/v2/interview')) {
      log('API_REQUEST_FAILED', {
        url: request.url,
        errorText: params.errorText,
        canceled: params.canceled
      });
      requestMap.delete(params.requestId);
    }
  });

  // Also log console messages for debugging
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('interview') || text.includes('apply') || text.includes('error') || text.includes('Error')) {
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
}

// Monitor for modals (DOM-based, non-intrusive)
async function monitorModals(page: Page) {
  setInterval(async () => {
    try {
      const modals = await page.evaluate(() => {
        const dialogElements = document.querySelectorAll('[role="dialog"]');
        const results: any[] = [];

        dialogElements.forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            const isApplyModal = el.className.includes('ApplyFlowApp') ||
                                el.className.includes('interview');

            if (isApplyModal) {
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
                  maxLength: element.maxLength > 0 ? element.maxLength : undefined
                });
              });

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
  }, 3000); // Check every 3 seconds
}

async function main() {
  log('PASSIVE_MONITORING_STARTED', { logFile: LOG_FILE });

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

  let page = browser.pages()[0];
  if (!page) {
    page = await browser.newPage();
  }

  // Set up PASSIVE monitoring (no route interception)
  await setupPassiveMonitoring(page);

  // Navigate to ZipRecruiter
  log('NAVIGATING_TO_ZIPRECRUITER');
  await page.goto('https://www.ziprecruiter.com/jobs-search?search=ai+engineer&location=', {
    waitUntil: 'domcontentloaded'
  });

  log('PAGE_LOADED', { url: page.url() });

  // Start monitoring modals
  await monitorModals(page);

  console.log('\n' + '='.repeat(80));
  console.log('🔍 PASSIVE API MONITORING ACTIVE');
  console.log('='.repeat(80));
  console.log('\n✅ NO INTERFERENCE - Website works normally');
  console.log('✅ Logging API calls in background');
  console.log('\nLog file:', LOG_FILE);
  console.log('\nInstructions:');
  console.log('1. Apply to jobs normally');
  console.log('2. Everything should work as expected');
  console.log('3. All API calls are being logged automatically');
  console.log('\n📋 Watching for:');
  console.log('   - /apply/api/v2/interview API calls');
  console.log('   - Request/response bodies (full JSON)');
  console.log('   - Modal form fields');
  console.log('   - No interference with normal operation');
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
