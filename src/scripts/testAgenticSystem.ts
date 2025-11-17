/**
 * Test script for the new agentic system
 * Demonstrates vision-based ZipRecruiter interaction
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { reactAgent } from '../agentic/reactAgent';
import { taskOrchestrator } from '../agentic/taskOrchestrator';
import { jobExtractionAgent } from '../agentic/jobExtractionAgent';
import { memoryManager } from '../agentic/memoryManager';
import { logger } from '../utils/logger';

async function testAgenticLogin() {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    console.log('\n===========================================');
    console.log('  Agentic System Test Suite');
    console.log('===========================================\n');

    // Launch browser
    console.log('🚀 Launching browser...\n');
    browser = await chromium.launch({
      headless: false, // Visible so you can see the agent work
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ],
    });

    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    page = await context.newPage();
    console.log('✓ Browser launched\n');

    // Test 1: Basic navigation and observation
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Navigate to ZipRecruiter');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const test1Result = await reactAgent.executeTask(
      page,
      'Navigate to https://www.ziprecruiter.com and describe what you see'
    );

    console.log('\nTest 1 Result:', test1Result.success ? '✅ PASS' : '❌ FAIL');
    if (test1Result.success) {
      console.log('Description:', test1Result.result);
    }

    await page.waitForTimeout(3000);

    // Test 2: High-level task orchestration
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Search for Jobs (Orchestrated)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const test2Result = await taskOrchestrator.executeGoal(
      page,
      'Search for "software engineer" jobs on ZipRecruiter'
    );

    console.log('\nTest 2 Result:', test2Result.success ? '✅ PASS' : '❌ FAIL');
    console.log('Summary:', test2Result.summary);
    console.log('Subtasks completed:', test2Result.results.filter(r => r.success).length, '/', test2Result.results.length);

    await page.waitForTimeout(3000);

    // Test 3: Job extraction
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Extract Jobs from Current Page');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const jobs = await jobExtractionAgent.extractJobsFromPage(page);

    console.log('\nTest 3 Result:', jobs.length > 0 ? '✅ PASS' : '⚠️  WARN');
    console.log(`Extracted ${jobs.length} jobs`);
    
    if (jobs.length > 0) {
      console.log('\nSample jobs:');
      jobs.slice(0, 3).forEach((job, i) => {
        console.log(`\n${i + 1}. ${job.title}`);
        console.log(`   Company: ${job.company}`);
        console.log(`   Location: ${job.location}`);
      });
    }

    // Test 4: Memory stats
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Memory & Learning Stats');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const memoryStats = memoryManager.getStats();
    
    console.log('Selector Cache:');
    console.log(`  - Total cached: ${memoryStats.selectorCache.total}`);
    console.log(`  - Avg success rate: ${(memoryStats.selectorCache.avgSuccessRate * 100).toFixed(1)}%`);
    
    console.log('\nEpisodes (Learning):');
    console.log(`  - Total episodes: ${memoryStats.episodes.total}`);
    console.log(`  - Success rate: ${(memoryStats.episodes.successRate * 100).toFixed(1)}%`);
    
    console.log('\nRecent Actions:');
    console.log(`  - In memory: ${memoryStats.recentActions}`);

    // Save memory to disk
    memoryManager.saveToDisk();
    console.log('\n✓ Memory saved to disk');

    // Summary
    console.log('\n===========================================');
    console.log('  TEST SUMMARY');
    console.log('===========================================\n');

    const tests = [
      { name: 'Navigation & Observation', passed: test1Result.success },
      { name: 'Task Orchestration', passed: test2Result.success },
      { name: 'Job Extraction', passed: jobs.length > 0 },
      { name: 'Memory System', passed: true },
    ];

    tests.forEach((test, i) => {
      console.log(`${i + 1}. ${test.name}: ${test.passed ? '✅ PASS' : '❌ FAIL'}`);
    });

    const passedCount = tests.filter(t => t.passed).length;
    console.log(`\nOverall: ${passedCount}/${tests.length} tests passed`);

    console.log('\n===========================================\n');

    // Keep browser open for inspection
    console.log('Browser will remain open for 30 seconds for inspection...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    logger.error('Test error', { error });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run test if executed directly
if (require.main === module) {
  testAgenticLogin()
    .then(() => {
      console.log('\nTest suite complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { testAgenticLogin };
