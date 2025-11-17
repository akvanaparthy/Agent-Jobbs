/**
 * ObservationLayer - Captures the current state of the browser
 */

import { Page } from 'playwright';
import { visionAgent } from './visionAgent';
import { Observation, UIState } from './types';
import { logger } from '../utils/logger';

export class ObservationLayer {
  /**
   * Observe the current state of the page
   */
  async observe(page: Page): Promise<Observation> {
    logger.info('👁️  Observing current state...');

    // Capture basic info
    const url = page.url();
    const title = await page.title();
    const screenshot = await page.screenshot({ fullPage: false });

    // Use vision to analyze the screen
    const analysis = await visionAgent.analyzeScreen(screenshot);

    const observation: Observation = {
      url,
      title,
      description: analysis.description,
      state: analysis.uiState,
      screenshot,
      timestamp: Date.now(),
      elements: analysis.interactiveElements,
    };

    logger.info('✅ Observation complete', {
      state: observation.state,
      elementCount: observation.elements?.length || 0,
    });

    return observation;
  }

  /**
   * Quick state detection without full analysis
   */
  async detectState(page: Page): Promise<UIState> {
    const screenshot = await page.screenshot({ fullPage: false });
    return await visionAgent.detectState(screenshot);
  }

  /**
   * Check if a specific element is visible
   */
  async isElementVisible(page: Page, description: string): Promise<boolean> {
    const screenshot = await page.screenshot({ fullPage: false });
    return await visionAgent.isElementVisible(screenshot, description);
  }

  /**
   * Wait for a specific UI state to appear
   */
  async waitForState(page: Page, targetState: UIState, timeoutMs: number = 30000): Promise<boolean> {
    logger.info('⏳ Waiting for state:', { targetState, timeoutMs });

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const currentState = await this.detectState(page);

      if (currentState === targetState) {
        logger.info('✅ Target state reached', { targetState });
        return true;
      }

      // Wait a bit before checking again
      await page.waitForTimeout(2000);
    }

    logger.warn('⏰ Timeout waiting for state', { targetState });
    return false;
  }

  /**
   * Wait for an element to appear
   */
  async waitForElement(
    page: Page,
    description: string,
    timeoutMs: number = 10000
  ): Promise<boolean> {
    logger.info('⏳ Waiting for element:', { description });

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const isVisible = await this.isElementVisible(page, description);

      if (isVisible) {
        logger.info('✅ Element appeared', { description });
        return true;
      }

      await page.waitForTimeout(1000);
    }

    logger.warn('⏰ Timeout waiting for element', { description });
    return false;
  }
}

// Export singleton
export const observationLayer = new ObservationLayer();
