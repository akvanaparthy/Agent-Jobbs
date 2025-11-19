import { browserManager } from '../automation/browser';
import { sessionManager } from '../automation/sessionManager';
import { logger } from '../utils/logger';
import * as readline from 'readline';

async function promptInput(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function setupProfileAuth(): Promise<void> {
  console.log('\n===========================================');
  console.log('  ZipRecruiter Profile-Based Auth Setup');
  console.log('===========================================\n');

  console.log('ℹ️  This script will open a browser window using your');
  console.log('   persistent profile. You can log in manually and the');
  console.log('   session will be saved automatically.\n');

  console.log('📋 Steps:');
  console.log('   1. Browser will open with persistent profile');
  console.log('   2. Log in to ZipRecruiter manually if needed');
  console.log('   3. Navigate to any authenticated page');
  console.log('   4. Press ENTER here when logged in\n');

  await promptInput('Press ENTER to continue: ');

  try {
    // Force headless off
    process.env.HEADLESS = 'false';
    process.env.USE_PERSISTENT_CONTEXT = 'true';

    console.log('\n🚀 Launching browser with persistent profile...\n');
    const { browser, context, page } = await browserManager.launch();

    console.log('✓ Browser launched successfully.');
    console.log('   Profile location: ./data/browser-profile/\n');

    // Navigate to ZipRecruiter homepage
    console.log('🌐 Navigating to ZipRecruiter...\n');
    await page.goto('https://www.ziprecruiter.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });

    // Wait for Cloudflare if present
    logger.info('Waiting for Cloudflare challenge...');
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
      console.log('✓ Cloudflare passed\n');
    } catch (error) {
      console.log('⚠️  Cloudflare challenge timeout - continuing anyway\n');
    }

    await page.waitForTimeout(2000);

    console.log('===========================================');
    console.log('  MANUAL LOGIN REQUIRED');
    console.log('===========================================\n');
    
    console.log('👉 In the browser window:');
    console.log('   1. Click "Sign In" if not already logged in');
    console.log('   2. Complete the login process (email, password, 2FA, etc.)');
    console.log('   3. Navigate to any page (e.g., job search, dashboard)');
    console.log('   4. Wait for the page to fully load\n');

    console.log('⚠️  DO NOT CLOSE THE BROWSER WINDOW!\n');

    await promptInput('Press ENTER after you have logged in: ');

    console.log('\n🔍 Validating session...\n');

    // Check if logged in by navigating to a protected page
    const isValid = await sessionManager.validateSession(page);

    if (!isValid) {
      console.error('\n❌ Login validation failed!');
      console.error('   It seems you are not logged in yet.');
      console.error('   Please make sure you completed the login process.\n');
      
      const retry = await promptInput('Do you want to try validating again? (y/n): ');
      
      if (retry.toLowerCase() === 'y') {
        const retryValid = await sessionManager.validateSession(page);
        if (!retryValid) {
          console.error('\n❌ Validation failed again. Please try running the setup again.\n');
          await browserManager.close();
          process.exit(1);
        }
      } else {
        await browserManager.close();
        process.exit(1);
      }
    }

    console.log('✓ Login validated successfully!\n');

    // Save session (cookies, localStorage, sessionStorage)
    console.log('💾 Saving session data...\n');
    await sessionManager.saveSession(context, page);

    console.log('✅ Authentication setup complete!\n');
    console.log('📋 What was saved:');
    console.log('   • Browser profile: ./data/browser-profile/ (persistent)\n');
    console.log('ℹ️  Your login will be reused automatically in future runs.');
    console.log('   The persistent profile contains all cookies and local storage.');
    console.log('   No need to run this again unless you want to re-login.\n');

    // Close browser
    await browserManager.close();

    console.log('===========================================\n');

  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    await browserManager.close();
    process.exit(1);
  }
}

// Run the setup
setupProfileAuth()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
