/**
 * Error Recovery Agent - Handles failures and attempts recovery
 */

import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { visionAgent } from './visionAgent';
import { RecoveryStrategy } from './types';
import { humanInput } from './humanInput';
import { memoryManager } from './memoryManager';

export class ErrorRecoveryAgent {
  /**
   * Classify an error type
   */
  private classifyError(error: Error, screenshot?: Buffer): string {
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }

    if (message.includes('not found') || message.includes('no element')) {
      return 'element_not_found';
    }

    if (message.includes('navigation')) {
      return 'navigation_failure';
    }

    if (message.includes('cloudflare') || message.includes('challenge')) {
      return 'cloudflare_challenge';
    }

    if (message.includes('network') || message.includes('connection')) {
      return 'network_error';
    }

    return 'unknown';
  }

  /**
   * Handle an error and attempt recovery
   */
  async handleError(
    error: Error,
    page: Page,
    context: { action?: string; params?: any }
  ): Promise<{ recovered: boolean; strategy?: string; error?: string }> {
    logger.warn('🚨 Error detected, attempting recovery', {
      error: error.message,
      context,
    });

    const screenshot = await page.screenshot();
    const errorType = this.classifyError(error, screenshot);

    logger.info('Error classified as:', { errorType });

    // Get recovery strategies
    const strategies = await this.getRecoveryStrategies(errorType, page, screenshot);

    // Try each strategy
    for (const strategy of strategies) {
      logger.info(`Trying recovery strategy: ${strategy.name}`, {
        likelihood: strategy.likelihood,
      });

      try {
        const success = await strategy.execute();

        if (success) {
          logger.info('✅ Recovery successful!', { strategy: strategy.name });
          return { recovered: true, strategy: strategy.name };
        } else {
          logger.warn(`Strategy ${strategy.name} did not succeed`);
        }
      } catch (strategyError) {
        logger.warn(`Strategy ${strategy.name} failed with error`, { strategyError });
        continue;
      }
    }

    logger.error('❌ All recovery strategies failed');
    return {
      recovered: false,
      error: 'All recovery strategies exhausted',
    };
  }

  /**
   * Get recovery strategies for an error type
   */
  private async getRecoveryStrategies(
    errorType: string,
    page: Page,
    screenshot: Buffer
  ): Promise<RecoveryStrategy[]> {
    const strategies: RecoveryStrategy[] = [];

    switch (errorType) {
      case 'timeout':
        strategies.push({
          name: 'wait_longer',
          description: 'Wait additional time for page to load',
          likelihood: 0.7,
          execute: async () => {
            logger.info('Waiting additional 10 seconds...');
            await page.waitForTimeout(10000);
            return true;
          },
        });

        strategies.push({
          name: 'reload_page',
          description: 'Reload the current page',
          likelihood: 0.5,
          execute: async () => {
            logger.info('Reloading page...');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            return true;
          },
        });
        break;

      case 'element_not_found':
        strategies.push({
          name: 'scroll_and_retry',
          description: 'Scroll page and look for element again',
          likelihood: 0.6,
          execute: async () => {
            logger.info('Scrolling down...');
            await page.evaluate(() => window.scrollBy(0, 500));
            await page.waitForTimeout(2000);
            return true;
          },
        });

        strategies.push({
          name: 'wait_for_element',
          description: 'Wait for element to appear',
          likelihood: 0.5,
          execute: async () => {
            logger.info('Waiting for dynamic content...');
            await page.waitForTimeout(5000);
            return true;
          },
        });
        break;

      case 'cloudflare_challenge':
        strategies.push({
          name: 'wait_for_cloudflare',
          description: 'Wait for Cloudflare challenge to auto-complete',
          likelihood: 0.8,
          execute: async () => {
            logger.info('Waiting for Cloudflare challenge (15 seconds)...');
            await page.waitForTimeout(15000);

            // Check if still on challenge page
            const newScreenshot = await page.screenshot();
            const analysis = await visionAgent.analyzeScreen(newScreenshot);

            const stillChallenge =
              analysis.description.toLowerCase().includes('cloudflare') ||
              analysis.description.toLowerCase().includes('challenge') ||
              analysis.uiState === 'cloudflare_challenge';

            return !stillChallenge;
          },
        });

        strategies.push({
          name: 'reload_and_wait',
          description: 'Reload page and wait for challenge',
          likelihood: 0.4,
          execute: async () => {
            logger.info('Reloading and waiting for Cloudflare...');
            await page.reload();
            await page.waitForTimeout(20000);
            return true;
          },
        });
        break;

      case 'navigation_failure':
        strategies.push({
          name: 'retry_navigation',
          description: 'Retry the navigation',
          likelihood: 0.6,
          execute: async () => {
            logger.info('Retrying navigation...');
            const currentUrl = page.url();
            await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            return true;
          },
        });

        strategies.push({
          name: 'go_back_and_forward',
          description: 'Navigate back then forward',
          likelihood: 0.3,
          execute: async () => {
            logger.info('Going back then forward...');
            await page.goBack({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);
            await page.goForward({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);
            return true;
          },
        });
        break;

      case 'network_error':
        strategies.push({
          name: 'wait_and_retry',
          description: 'Wait for network to recover',
          likelihood: 0.5,
          execute: async () => {
            logger.info('Waiting for network recovery (10 seconds)...');
            await page.waitForTimeout(10000);
            return true;
          },
        });

        strategies.push({
          name: 'reload_page',
          description: 'Reload the page',
          likelihood: 0.7,
          execute: async () => {
            logger.info('Reloading page after network error...');
            await page.reload({ waitUntil: 'networkidle' });
            return true;
          },
        });
        break;

      default:
        // Generic recovery strategies
        strategies.push({
          name: 'wait_and_observe',
          description: 'Wait and see if situation resolves',
          likelihood: 0.3,
          execute: async () => {
            logger.info('Waiting to see if error resolves...');
            await page.waitForTimeout(5000);
            return true;
          },
        });

        strategies.push({
          name: 'reload_page',
          description: 'Reload the current page',
          likelihood: 0.4,
          execute: async () => {
            logger.info('Reloading page as generic recovery...');
            await page.reload();
            await page.waitForTimeout(3000);
            return true;
          },
        });
    }

    // Sort by likelihood (highest first)
    return strategies.sort((a, b) => b.likelihood - a.likelihood);
  }

  /**
   * Detect Cloudflare challenge
   */
  async detectCloudflare(page: Page): Promise<boolean> {
    try {
      const screenshot = await page.screenshot();
      const analysis = await visionAgent.analyzeScreen(screenshot);

      const isCloudflare =
        analysis.description.toLowerCase().includes('cloudflare') ||
        analysis.description.toLowerCase().includes('checking your browser') ||
        analysis.description.toLowerCase().includes('just a moment') ||
        analysis.uiState === 'cloudflare_challenge';

      if (isCloudflare) {
        logger.warn('🛡️  Cloudflare challenge detected');
      }

      return isCloudflare;
    } catch (error) {
      logger.error('Failed to detect Cloudflare', { error });
      return false;
    }
  }

  /**
   * Wait for Cloudflare challenge to complete
   */
  async waitForCloudflare(page: Page, timeoutMs: number = 30000): Promise<boolean> {
    logger.info('⏳ Waiting for Cloudflare challenge to complete...');

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const isChallenge = await this.detectCloudflare(page);

      if (!isChallenge) {
        logger.info('✅ Cloudflare challenge passed!');
        return true;
      }

      logger.debug('Still on Cloudflare challenge, waiting...');
      await page.waitForTimeout(3000);
    }

    logger.warn('⏰ Timeout waiting for Cloudflare challenge');
    return false;
  }

  /**
   * Check if page is in error state
   */
  async isErrorPage(page: Page): Promise<boolean> {
    try {
      const screenshot = await page.screenshot();
      const analysis = await visionAgent.analyzeScreen(screenshot);

      return (
        analysis.uiState === 'error_page' ||
        analysis.description.toLowerCase().includes('error') ||
        analysis.description.toLowerCase().includes('not found') ||
        analysis.description.toLowerCase().includes('404') ||
        analysis.description.toLowerCase().includes('500')
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Request human intervention
   */
  async requestHumanHelp(
    error: Error,
    page: Page,
    context: string
  ): Promise<{ fixed: boolean; solution?: string }> {
    logger.error('🆘 Requesting human intervention', {
      error: error.message,
      context,
      url: page.url(),
    });

    console.log('\n' + '='.repeat(60));
    console.log('  🆘 HUMAN HELP NEEDED');
    console.log('='.repeat(60));
    console.log(`\nError: ${error.message}`);
    console.log(`Context: ${context}`);
    console.log(`URL: ${page.url()}\n`);
    console.log('The browser window is visible. Please fix the issue manually.');
    console.log('='.repeat(60) + '\n');

    // Wait for human to signal they're done
    await humanInput.waitForReady(
      'Press Enter when you have fixed the issue (or type "skip" to skip)'
    );

    // Ask what they did
    const solution = await humanInput.askHuman(
      'What did you do to fix it? (This helps the agent learn)',
      { defaultValue: 'Manual intervention' }
    );

    // Record the learning
    memoryManager.recordEpisode({
      task: `Error recovery: ${error.message}`,
      success: true,
      approach: `Human intervention: ${solution}`,
      duration: 0,
      timestamp: Date.now(),
      learnings: [
        `Error: ${error.message}`,
        `Context: ${context}`,
        `Solution: ${solution}`,
      ],
    });

    logger.info('Resuming after human intervention', { solution });

    return {
      fixed: true,
      solution,
    };
  }
}

// Export singleton
export const errorRecoveryAgent = new ErrorRecoveryAgent();
