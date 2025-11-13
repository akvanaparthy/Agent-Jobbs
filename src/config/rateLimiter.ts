import * as fs from 'fs';
import * as path from 'path';
import { config, getRandomDelay } from './config';
import { RateLimitState } from '../types';
import { logger, logRateLimit } from '../utils/logger';

const STATE_FILE = path.resolve(process.cwd(), 'data', 'rate-limit-state.json');

export class RateLimiter {
  private state: RateLimitState;

  constructor() {
    this.state = this.loadState();
    this.checkDailyReset();
  }

  /**
   * Load rate limit state from file
   */
  private loadState(): RateLimitState {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = fs.readFileSync(STATE_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.warn('Failed to load rate limit state, starting fresh');
    }

    // Default state
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    return {
      applicationsToday: 0,
      dailyResetTime: tomorrow.getTime(),
    };
  }

  /**
   * Save rate limit state to file
   */
  private saveState(): void {
    try {
      const dir = path.dirname(STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (error) {
      logger.error('Failed to save rate limit state', { error });
    }
  }

  /**
   * Check if we need to reset daily counter
   */
  private checkDailyReset(): void {
    const now = Date.now();
    if (now >= this.state.dailyResetTime) {
      logger.info('Daily rate limit reset');
      this.state.applicationsToday = 0;

      // Set next reset time
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      this.state.dailyResetTime = tomorrow.getTime();

      this.saveState();
    }
  }

  /**
   * Check if we can apply to another job now
   */
  canApply(): { allowed: boolean; reason?: string; waitUntil?: number } {
    this.checkDailyReset();

    // Check daily limit
    if (this.state.applicationsToday >= config.maxApplicationsPerDay) {
      const waitUntil = this.state.dailyResetTime;
      return {
        allowed: false,
        reason: `Daily limit reached (${config.maxApplicationsPerDay} applications)`,
        waitUntil,
      };
    }

    // Check time between applications
    if (this.state.nextAvailableTime && Date.now() < this.state.nextAvailableTime) {
      return {
        allowed: false,
        reason: 'Too soon since last application',
        waitUntil: this.state.nextAvailableTime,
      };
    }

    return { allowed: true };
  }

  /**
   * Record an application and update state
   */
  recordApplication(): void {
    this.checkDailyReset();

    const now = Date.now();
    this.state.applicationsToday++;
    this.state.lastApplicationTime = now;
    this.state.nextAvailableTime = now + getRandomDelay();

    this.saveState();

    logger.info('Application recorded', {
      applicationsToday: this.state.applicationsToday,
      maxPerDay: config.maxApplicationsPerDay,
      nextAvailable: new Date(this.state.nextAvailableTime).toISOString(),
    });
  }

  /**
   * Get time until next application is allowed
   */
  getTimeUntilNext(): number {
    const check = this.canApply();
    if (check.allowed) return 0;
    if (!check.waitUntil) return 0;
    return Math.max(0, check.waitUntil - Date.now());
  }

  /**
   * Get current statistics
   */
  getStats(): { applicationsToday: number; remaining: number; nextAvailable: Date | null } {
    this.checkDailyReset();

    return {
      applicationsToday: this.state.applicationsToday,
      remaining: Math.max(0, config.maxApplicationsPerDay - this.state.applicationsToday),
      nextAvailable: this.state.nextAvailableTime
        ? new Date(this.state.nextAvailableTime)
        : null,
    };
  }

  /**
   * Wait until we can apply again
   */
  async waitUntilReady(): Promise<void> {
    const check = this.canApply();

    if (check.allowed) {
      return;
    }

    const waitMs = this.getTimeUntilNext();
    const waitUntil = check.waitUntil ? new Date(check.waitUntil) : new Date();

    logRateLimit(check.reason || 'Rate limit active', waitUntil);

    if (waitMs > 0) {
      logger.info(`Waiting ${Math.ceil(waitMs / 1000 / 60)} minutes...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    // Recheck after waiting
    return this.waitUntilReady();
  }

  /**
   * Reset the rate limiter (for testing)
   */
  reset(): void {
    this.state.applicationsToday = 0;
    this.state.lastApplicationTime = undefined;
    this.state.nextAvailableTime = undefined;
    this.saveState();
    logger.info('Rate limiter reset');
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();
