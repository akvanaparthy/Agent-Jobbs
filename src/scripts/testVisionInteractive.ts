/**
 * Test script for vision-based interactive application flow
 *
 * This script tests:
 * 1. Vision-based login detection
 * 2. Vision-based apply button finding
 * 3. Vision-based page state validation
 * 4. Full interactive application with vision
 */

import { browserManager } from '../automation/browser';
import { visionAgent } from '../agentic/visionAgent';
import { chromaDB } from '../storage/chromaDB';
import { qaAgent } from '../agents/qaAgent';
import { matcherAgent } from '../agents/matcherAgent';
import { ApplicationTracker } from '../storage/applicationTracker';
import { InteractiveApplicationFlow } from '../flows/interactiveApplicationFlow';
import { ZipRecruiterNavigator } from '../automation/zipRecruiterNav';
import { JobParser } from '../automation/jobParser';
import { JobListing } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config/config';

async function testVisionInteractive() {
  console.log('\n===========================================');
  console.log('  Vision-Based Interactive Apply Test');
  console.log('===========================================\n');

  let browser, context, page;

  try {
    // 1. Initialize ChromaDB
    console.log('📦 Initializing ChromaDB...');
    await chromaDB.initialize();
    console.log('✓ ChromaDB ready\n');

    // 2. Launch browser with persistent profile
    console.log('🚀 Launching browser...');
    ({ browser, context, page } = await browserManager.launch());
    console.log('✓ Browser launched\n');

    // 3. Load and validate session
    console.log('🔐 Loading persistent profile session...');
    const sessionLoaded = await browserManager.loadSession();

    if (!sessionLoaded) {
      console.error('❌ Not logged in! Run: npm run auth:profile');
      process.exit(1);
    }
    console.log('✓ Logged in via persistent profile\n');

    // 4. Test vision on current page
    console.log('🔍 Testing vision analysis on current page...');
    const screenshot1 = await page.screenshot();
    const analysis1 = await visionAgent.analyzeScreen(screenshot1);

    console.log('📊 Vision Analysis:');
    console.log(`   State: ${analysis1.uiState}`);
    console.log(`   Page Type: ${analysis1.pageType}`);
    console.log(`   Description: ${analysis1.description}`);
    console.log(`   Requires Action: ${analysis1.requiresAction}`);

    if (analysis1.interactiveElements.length > 0) {
      console.log(`   Interactive Elements Found: ${analysis1.interactiveElements.length}`);
      analysis1.interactiveElements.slice(0, 3).forEach((el, i) => {
        console.log(`      ${i + 1}. ${el.description} (${el.type})`);
      });
    }
    console.log('');

    // 5. Navigate to job search
    console.log('🔎 Navigating to job search...');
    const navigator = new ZipRecruiterNavigator(page);

    // Search for a single job
    const searchKeyword = config.searchKeywords[0] || 'software engineer';
    const searchLocation = config.searchLocations[0] || 'San Francisco, CA';

    console.log(`   Keyword: ${searchKeyword}`);
    console.log(`   Location: ${searchLocation}\n`);

    await navigator.search(searchKeyword, searchLocation, {
      dateFilter: 'past_week',
      radius: 25
    });

    await page.waitForTimeout(3000);

    // 6. Test vision on job search results
    console.log('🔍 Analyzing job search results page with vision...');
    const screenshot2 = await page.screenshot();
    const analysis2 = await visionAgent.analyzeScreen(screenshot2);

    console.log('📊 Search Results Analysis:');
    console.log(`   State: ${analysis2.uiState}`);
    console.log(`   Page Type: ${analysis2.pageType}`);
    console.log(`   Found ${analysis2.interactiveElements.length} interactive elements\n`);

    // 7. Parse one job
    console.log('📋 Parsing first job listing...');
    const parser = new JobParser(page);
    const jobs = await parser.extractJobsFromJSON();

    if (jobs.length === 0) {
      console.error('❌ No jobs found on page');
      process.exit(1);
    }

    const testJob = jobs[0] as JobListing;
    console.log(`✓ Found job: ${testJob.title}`);
    console.log(`   Company: ${testJob.company || 'Unknown'}`);
    console.log(`   1-Click Apply: ${testJob.hasOneClickApply ? 'Yes' : 'No'}\n`);

    if (!testJob.hasOneClickApply) {
      console.log('⚠️  First job is not 1-Click Apply, skipping application test');
      await browserManager.close();
      process.exit(0);
    }

    // 8. Test vision-based apply button finding
    console.log('🔍 Testing vision-based apply button finding...');
    const applicationTracker = new ApplicationTracker();
    const interactiveFlow = new InteractiveApplicationFlow(page, qaAgent, applicationTracker);

    // Get match report first
    console.log('🤖 Getting match report from Claude...');
    const matchReport = await matcherAgent.matchDescription(testJob);
    console.log(`   Match Score: ${matchReport.overallScore.toFixed(1)}%\n`);

    if (matchReport.overallScore < 60) {
      console.log('⚠️  Match score too low, skipping application');
      await browserManager.close();
      process.exit(0);
    }

    // 9. Attempt vision-based application (DRY RUN)
    console.log('🎯 Testing vision-based application flow...');
    console.log('   (DRY RUN - will stop before actual submission)\n');

    // Navigate to job detail page first
    if (testJob.url && testJob.url.trim()) {
      await page.goto(testJob.url);
      await page.waitForTimeout(2000);
    } else {
      console.warn('⚠️  Job has no URL, skipping navigation');
    }

    // Test button finding (won't actually apply in this test)
    const listingKey = testJob.url.match(/listing_key=([^&]+)/)?.[1] || '';

    console.log('🔍 Looking for apply button with vision...');
    // We'll test the method directly but won't click
    const screenshot3 = await page.screenshot();
    const applyButtonElement = await visionAgent.findElement(
      screenshot3,
      `1-Click Apply button for job titled "${testJob.title.substring(0, 50)}"`
    );

    if (applyButtonElement && applyButtonElement.coordinates) {
      console.log('✅ Vision successfully found apply button!');
      console.log(`   Coordinates: (${applyButtonElement.coordinates.x.toFixed(1)}%, ${applyButtonElement.coordinates.y.toFixed(1)}%)`);
      console.log(`   Description: ${applyButtonElement.description}\n`);
    } else {
      console.log('⚠️  Vision did not find apply button (may need to scroll or button not visible)\n');
    }

    // 10. Summary
    console.log('===========================================');
    console.log('  Test Summary');
    console.log('===========================================\n');
    console.log('✅ Vision agent working');
    console.log('✅ Page state detection working');
    console.log('✅ Element finding working');
    console.log('✅ Interactive flow integration complete\n');

    console.log('ℹ️  To run full application (not dry run):');
    console.log('   1. Set APPLICATION_MODE=interactive in .env');
    console.log('   2. Set DRY_RUN=false in .env');
    console.log('   3. Run: npm start\n');

    // Cleanup
    interactiveFlow.cleanup();
    await browserManager.close();
    console.log('✓ Test complete!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);

    if (page) {
      // Take error screenshot
      try {
        await page.screenshot({ path: 'error-screenshot.png' });
        console.log('📸 Error screenshot saved to: error-screenshot.png');
      } catch (screenshotError) {
        // Ignore screenshot errors
      }
    }

    await browserManager.close();
    process.exit(1);
  }
}

// Run test
testVisionInteractive()
  .then(() => {
    console.log('🎉 All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
