import { chromium } from 'playwright';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Setup a persistent browser profile by manually logging in
 * This creates a user data directory that can be reused to avoid Cloudflare challenges
 */
async function setupBrowserProfile() {
  const userDataDir = path.resolve(process.cwd(), 'data', 'browser-profile');

  console.log('===========================================');
  console.log('  Browser Profile Setup for ZipRecruiter');
  console.log('===========================================\n');
  console.log('📌 This will open a browser where you can:');
  console.log('   1. Solve any Cloudflare challenges');
  console.log('   2. Log in to your ZipRecruiter account');
  console.log('   3. Close the browser when done\n');
  console.log('🔧 Browser profile will be saved to:');
  console.log(`   ${userDataDir}\n`);
  console.log('===========================================\n');

  try {
    // Launch browser with persistent context
    const browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1920,1080',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    const page = browser.pages()[0] || await browser.newPage();

    // Navigate to ZipRecruiter
    console.log('🌐 Opening ZipRecruiter...\n');
    await page.goto('https://www.ziprecruiter.com', {
      waitUntil: 'domcontentloaded',
    });

    console.log('✅ Browser is ready!');
    console.log('\n📋 Manual steps:');
    console.log('   1. Solve the Cloudflare challenge if it appears');
    console.log('   2. Click "Sign In" and log in to your account');
    console.log('   3. Navigate around to ensure you\'re logged in');
    console.log('   4. Close the browser window when done\n');
    console.log('⏳ Waiting for you to complete the setup...\n');

    // Wait for user to close the browser
    await page.waitForEvent('close', { timeout: 0 });

    console.log('\n✅ Browser profile saved successfully!');
    console.log('📁 Location:', userDataDir);
    console.log('\n🚀 You can now use this profile by setting USE_PERSISTENT_CONTEXT=true in .env');
    console.log('===========================================\n');

  } catch (error) {
    logger.error('Failed to setup browser profile', { error });
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the setup
setupBrowserProfile();
