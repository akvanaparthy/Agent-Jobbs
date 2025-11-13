import { browserManager } from '../automation/browser';
import { sessionManager } from '../automation/sessionManager';
import { logger } from '../utils/logger';
import { ZIPRECRUITER_LOGIN_URL } from '../config/constants';
import * as readline from 'readline';

async function setupAuth(): Promise<void> {
  console.log('\n===========================================');
  console.log('  ZipRecruiter Authentication Setup');
  console.log('===========================================\n');

  // Check if session already exists
  if (sessionManager.hasSession()) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question('A session already exists. Do you want to replace it? (y/n): ', resolve);
    });

    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      return;
    }

    sessionManager.deleteSession();
  }

  console.log('Launching browser...\n');

  try {
    // Launch browser (non-headless for manual login)
    process.env.HEADLESS = 'false'; // Force non-headless mode
    const { browser, context, page } = await browserManager.launch();

    console.log('Browser launched successfully.');
    console.log(`\nNavigating to: ${ZIPRECRUITER_LOGIN_URL}`);

    await page.goto(ZIPRECRUITER_LOGIN_URL, { waitUntil: 'networkidle' });

    console.log('\n===========================================');
    console.log('  PLEASE LOG IN MANUALLY IN THE BROWSER');
    console.log('===========================================\n');
    console.log('Instructions:');
    console.log('1. Complete the login process in the browser window');
    console.log('2. Wait until you see your dashboard or profile');
    console.log('3. Do NOT close the browser window');
    console.log('4. Come back here and press ENTER when done\n');

    // Wait for user to press Enter
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    await new Promise<void>((resolve) => {
      rl.question('Press ENTER after you have logged in: ', () => {
        rl.close();
        resolve();
      });
    });

    console.log('\nValidating login...');

    // Validate that login was successful
    const isValid = await sessionManager.validateSession(page);

    if (!isValid) {
      console.error('\n❌ Login validation failed!');
      console.error('Please make sure you are logged in and try again.');
      await browserManager.close();
      process.exit(1);
    }

    console.log('✓ Login validated successfully\n');

    // Save session
    console.log('Saving session...');
    await sessionManager.saveSession(context, page);

    console.log('\n✓ Authentication setup complete!');
    console.log('Your session has been saved and will be reused in future runs.\n');

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
setupAuth()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
