import { browserManager } from '../automation/browser';
import { sessionManager } from '../automation/sessionManager';
import { logger } from '../utils/logger';
import { ZIPRECRUITER_LOGIN_URL } from '../config/constants';
import { randomSleep } from '../utils/delays';
import * as readline from 'readline';

async function promptInput(question: string, hidden: boolean = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve) => {
    if (hidden) {
      // Hide input for password/OTP
      const stdin = process.stdin;
      (stdin as any).setRawMode(true);
      
      rl.question(question, (answer) => {
        (stdin as any).setRawMode(false);
        console.log(''); // New line after hidden input
        rl.close();
        resolve(answer);
      });

      // Capture keypress for hidden input
      const onData = (char: Buffer) => {
        const byte = char.toString();
        if (byte === '\r' || byte === '\n') {
          stdin.removeListener('data', onData);
          (rl as any).write('\n');
          (rl as any).emit('line');
        } else if (byte === '\x7f' || byte === '\b') {
          // Handle backspace
          process.stdout.write('\b \b');
        } else if (byte === '\x03') {
          // Handle Ctrl+C
          process.exit(0);
        } else {
          process.stdout.write('*');
          (rl as any).line += byte;
        }
      };
      stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function setupAuth(): Promise<void> {
  console.log('\n===========================================');
  console.log('  ZipRecruiter Authentication Setup');
  console.log('===========================================\n');

  // Check if using persistent context
  const usePersistent = process.env.USE_PERSISTENT_CONTEXT === 'true';
  
  if (usePersistent) {
    console.log('ℹ️  You are using PERSISTENT BROWSER PROFILE mode.');
    console.log('   Email/password login is NOT required.\n');
    console.log('📋 Please use the profile-based auth setup instead:');
    console.log('   npm run auth:profile\n');
    console.log('   Or manually log in when the browser opens during normal runs.\n');
    process.exit(0);
  }

  // Check if session already exists
  if (sessionManager.hasSession()) {
    const answer = await promptInput('A session already exists. Do you want to replace it? (y/n): ');

    if (answer.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      return;
    }

    sessionManager.deleteSession();
  }

  // Get email from environment
  const email = process.env.ZIPRECRUITER_EMAIL;
  if (!email) {
    console.error('\n❌ ZIPRECRUITER_EMAIL not found in .env file!');
    console.error('Please add your email to the .env file:');
    console.error('ZIPRECRUITER_EMAIL=your_email@example.com\n');
    console.error('ℹ️  Or switch to profile-based auth (recommended):');
    console.error('   Set USE_PERSISTENT_CONTEXT=true in .env');
    console.error('   Then run: npm run auth:profile\n');
    process.exit(1);
  }

  console.log(`Using email: ${email}\n`);
  console.log('Launching browser...\n');

  try {
    // Launch browser (visible for user to see the process)
    process.env.HEADLESS = 'false';
    const { browser, context, page } = await browserManager.launch();

    console.log('✓ Browser launched successfully.');
    console.log('\nNavigating to ZipRecruiter login page...\n');

    // Navigate to login page
    await page.goto(ZIPRECRUITER_LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await randomSleep(2000, 3000);

    console.log('✓ Login page loaded.');
    console.log('\nFilling in email address...\n');

    // Find and fill email field
    const emailSelector = 'input[type="email"], input[name="email"], input[id="email"]';
    await page.waitForSelector(emailSelector, { timeout: 10000 });
    await page.fill(emailSelector, email);
    await randomSleep(1000, 2000);

    // Click continue/next button
    const continueButton = 'button[type="submit"], button:has-text("Continue"), button:has-text("Next")';
    await page.click(continueButton);
    await randomSleep(2000, 3000);

    console.log('✓ Email submitted.\n');
    console.log('===========================================');
    console.log('  PASSWORD/OTP REQUIRED');
    console.log('===========================================\n');

    // Check if it's password or OTP flow
    const hasPasswordField = await page.locator('input[type="password"]').count() > 0;
    const hasOtpField = await page.locator('input[name*="code"], input[name*="otp"], input[placeholder*="code"]').count() > 0;

    if (hasPasswordField) {
      console.log('📋 ZipRecruiter is asking for your PASSWORD.\n');
      const password = await promptInput('Enter your password: ', true);

      console.log('\nEntering password...');
      await page.fill('input[type="password"]', password);
      await randomSleep(1000, 2000);

      // Submit password
      const submitButton = 'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")';
      await page.click(submitButton);
      await randomSleep(3000, 5000);

      // Check if OTP is needed after password
      const needsOtp = await page.locator('input[name*="code"], input[name*="otp"], input[placeholder*="code"]').count() > 0;
      
      if (needsOtp) {
        console.log('\n📋 2FA/OTP required! Check your email or phone.\n');
        const otp = await promptInput('Enter the OTP code: ');
        
        console.log('\nEntering OTP...');
        const otpSelector = 'input[name*="code"], input[name*="otp"], input[placeholder*="code"]';
        await page.fill(otpSelector, otp);
        await randomSleep(1000, 2000);
        
        const verifyButton = 'button[type="submit"], button:has-text("Verify"), button:has-text("Submit")';
        await page.click(verifyButton);
        await randomSleep(3000, 5000);
      }
    } else if (hasOtpField) {
      console.log('📋 ZipRecruiter sent an OTP to your email/phone.\n');
      const otp = await promptInput('Enter the OTP code: ');

      console.log('\nEntering OTP...');
      const otpSelector = 'input[name*="code"], input[name*="otp"], input[placeholder*="code"]';
      await page.fill(otpSelector, otp);
      await randomSleep(1000, 2000);

      const verifyButton = 'button[type="submit"], button:has-text("Verify"), button:has-text("Submit")';
      await page.click(verifyButton);
      await randomSleep(3000, 5000);
    } else {
      console.log('\n⚠️  Could not detect password or OTP field.');
      console.log('The browser window is open. Please complete login manually.');
      await promptInput('\nPress ENTER after you have logged in: ');
    }

    console.log('\n✓ Login completed!\n');
    console.log('Validating session...');

    // Validate that login was successful
    const isValid = await sessionManager.validateSession(page);

    if (!isValid) {
      console.error('\n❌ Login validation failed!');
      console.error('Please make sure you completed the login process.');
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
