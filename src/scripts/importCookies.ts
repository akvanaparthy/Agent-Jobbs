import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { SessionData } from '../types';
import { PATHS } from '../config/constants';

// Load environment variables
dotenv.config();

/**
 * Convert browser extension sameSite values to Playwright format
 */
function convertSameSite(sameSite: string | null): 'Strict' | 'Lax' | 'None' | undefined {
  if (!sameSite) return undefined;
  
  const lower = sameSite.toLowerCase();
  if (lower === 'strict') return 'Strict';
  if (lower === 'lax') return 'Lax';
  if (lower === 'none' || lower === 'no_restriction') return 'None';
  
  return 'Lax'; // Default
}

/**
 * Import cookies from .env to create a session file
 * 
 * HOW TO USE:
 * 1. Log in to ZipRecruiter in your browser
 * 2. Press F12 → Application → Cookies → ziprecruiter.com
 * 3. Copy cookies and add to .env as ZIPRECRUITER_COOKIES (JSON format)
 * 4. Run: npm run auth:import
 */

async function importCookies(): Promise<void> {
  console.log('\n===========================================');
  console.log('  Manual Cookie Import for ZipRecruiter');
  console.log('===========================================\n');

  // Read cookies from environment variable
  const cookiesJson = process.env.ZIPRECRUITER_COOKIES;

  if (!cookiesJson) {
    console.error('\n❌ ZIPRECRUITER_COOKIES not found in .env file!\n');
    console.error('📋 INSTRUCTIONS:');
    console.error('1. Log in to ZipRecruiter in your browser');
    console.error('2. Press F12 → Application tab → Cookies');
    console.error('3. Copy ALL cookies from ziprecruiter.com');
    console.error('4. Add to .env file as:\n');
    console.error('ZIPRECRUITER_COOKIES=\'[{"name":"sessionid","value":"..."},...]\'\n');
    console.error('See docs/COOKIE_IMPORT_GUIDE.md for detailed instructions.\n');
    process.exit(1);
  }

  let cookiesData: any[];
  
  try {
    cookiesData = JSON.parse(cookiesJson);
  } catch (error) {
    console.error('\n❌ Invalid JSON format in ZIPRECRUITER_COOKIES!');
    console.error('Make sure the cookies are in valid JSON array format.\n');
    console.error('Example:');
    console.error('ZIPRECRUITER_COOKIES=\'[{"name":"sessionid","value":"abc123"}]\'\n');
    process.exit(1);
  }

  if (!Array.isArray(cookiesData) || cookiesData.length === 0) {
    console.error('\n❌ No cookies found in ZIPRECRUITER_COOKIES!');
    console.error('Make sure you pasted at least one cookie.\n');
    process.exit(1);
  }

  console.log(`✓ Found ${cookiesData.length} cookies\n`);

  // Convert cookie format from browser extension to Playwright format
  const playwrightCookies = cookiesData.map((cookie: any) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || '/',
    expires: cookie.expirationDate ? Math.floor(cookie.expirationDate) : -1,
    httpOnly: cookie.httpOnly || false,
    secure: cookie.secure || false,
    sameSite: convertSameSite(cookie.sameSite),
  }));

  console.log('✓ Cookies converted to Playwright format\n');

  // Create session data
  const sessionData: SessionData = {
    cookies: playwrightCookies,
    localStorage: {},
    sessionStorage: {},
    savedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  };

  // Ensure directory exists
  const sessionFile = path.resolve(process.cwd(), PATHS.SESSION_FILE);
  const dir = path.dirname(sessionFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Save session
  fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));

  console.log('✓ Session file created successfully!');
  console.log(`📁 Location: ${sessionFile}\n`);
  console.log('===========================================\n');
  console.log('✅ You can now run: npm start\n');
}

// Run the import
importCookies()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
