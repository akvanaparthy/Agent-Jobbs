/**
 * Memory System - Manages agent memory for learning and caching
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { CachedSelector, Episode, MemoryEntry } from './types';

export class MemoryManager {
  private selectorCache: Map<string, CachedSelector> = new Map();
  private episodes: Episode[] = [];
  private recentActions: MemoryEntry[] = [];
  private cacheFile: string;
  private episodesFile: string;

  constructor(dataDir: string = './data/agentic') {
    this.cacheFile = path.join(dataDir, 'selector-cache.json');
    this.episodesFile = path.join(dataDir, 'episodes.json');
    this.ensureDataDir(dataDir);
    this.loadFromDisk();
  }

  /**
   * Ensure data directory exists
   */
  private ensureDataDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Load cached data from disk
   */
  private loadFromDisk(): void {
    try {
      // Load selector cache
      if (fs.existsSync(this.cacheFile)) {
        const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
        this.selectorCache = new Map(Object.entries(data));
        logger.info('Loaded selector cache', { count: this.selectorCache.size });
      }

      // Load episodes
      if (fs.existsSync(this.episodesFile)) {
        this.episodes = JSON.parse(fs.readFileSync(this.episodesFile, 'utf-8'));
        logger.info('Loaded episodes', { count: this.episodes.length });
      }
    } catch (error) {
      logger.warn('Failed to load memory from disk', { error });
    }
  }

  /**
   * Save cache to disk
   */
  saveToDisk(): void {
    try {
      // Save selector cache
      const cacheObj = Object.fromEntries(this.selectorCache);
      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheObj, null, 2));

      // Save episodes
      fs.writeFileSync(this.episodesFile, JSON.stringify(this.episodes, null, 2));

      logger.debug('Memory saved to disk');
    } catch (error) {
      logger.error('Failed to save memory to disk', { error });
    }
  }

  // ============= Selector Cache =============

  /**
   * Get cached selector for a description
   */
  getCachedSelector(description: string): string | null {
    const cached = this.selectorCache.get(description);

    if (!cached) {
      return null;
    }

    // Check if cache is still valid (not too old)
    const age = Date.now() - cached.lastValidated;
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    if (age > maxAge) {
      logger.debug('Selector cache expired', { description });
      this.selectorCache.delete(description);
      return null;
    }

    // Check success rate
    const totalAttempts = cached.successCount + cached.failureCount;
    const successRate = totalAttempts > 0 ? cached.successCount / totalAttempts : 0;

    if (successRate < 0.5 && totalAttempts >= 3) {
      logger.debug('Selector cache has low success rate', {
        description,
        successRate,
      });
      this.selectorCache.delete(description);
      return null;
    }

    // Update last used
    cached.lastUsed = Date.now();
    return cached.selector;
  }

  /**
   * Cache a selector
   */
  cacheSelector(description: string, selector: string): void {
    const existing = this.selectorCache.get(description);

    if (existing) {
      existing.selector = selector;
      existing.successCount++;
      existing.lastUsed = Date.now();
      existing.lastValidated = Date.now();
    } else {
      this.selectorCache.set(description, {
        description,
        selector,
        successCount: 1,
        failureCount: 0,
        lastUsed: Date.now(),
        lastValidated: Date.now(),
      });
    }

    // Periodically save to disk
    if (this.selectorCache.size % 10 === 0) {
      this.saveToDisk();
    }
  }

  /**
   * Mark selector as failed
   */
  markSelectorFailed(description: string): void {
    const cached = this.selectorCache.get(description);

    if (cached) {
      cached.failureCount++;

      // Remove if too many failures
      const totalAttempts = cached.successCount + cached.failureCount;
      const successRate = cached.successCount / totalAttempts;

      if (successRate < 0.3 && totalAttempts >= 5) {
        logger.info('Removing unreliable selector from cache', {
          description,
          successRate,
        });
        this.selectorCache.delete(description);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { total: number; avgSuccessRate: number } {
    const entries = Array.from(this.selectorCache.values());

    if (entries.length === 0) {
      return { total: 0, avgSuccessRate: 0 };
    }

    const avgSuccessRate =
      entries.reduce((sum, entry) => {
        const total = entry.successCount + entry.failureCount;
        return sum + (total > 0 ? entry.successCount / total : 0);
      }, 0) / entries.length;

    return {
      total: entries.length,
      avgSuccessRate,
    };
  }

  // ============= Episodes (Long-term Learning) =============

  /**
   * Record a completed episode
   */
  recordEpisode(episode: Episode): void {
    this.episodes.push(episode);

    // Keep only recent episodes (last 100)
    if (this.episodes.length > 100) {
      this.episodes = this.episodes.slice(-100);
    }

    this.saveToDisk();
  }

  /**
   * Find similar past episodes
   */
  findSimilarEpisodes(task: string, limit: number = 5): Episode[] {
    // Simple keyword matching for now
    // TODO: Use embeddings for better similarity search
    const taskLower = task.toLowerCase();
    const keywords = taskLower.split(/\s+/);

    const scored = this.episodes.map(episode => {
      const episodeLower = episode.task.toLowerCase();
      const matches = keywords.filter(kw => episodeLower.includes(kw)).length;
      return { episode, score: matches };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.episode);
  }

  /**
   * Get success rate for a type of task
   */
  getTaskSuccessRate(taskPattern: string): number {
    const matching = this.episodes.filter(e =>
      e.task.toLowerCase().includes(taskPattern.toLowerCase())
    );

    if (matching.length === 0) {
      return 0;
    }

    const successful = matching.filter(e => e.success).length;
    return successful / matching.length;
  }

  // ============= Recent Actions (Short-term Memory) =============

  /**
   * Add action to recent memory
   */
  addRecentAction(entry: MemoryEntry): void {
    this.recentActions.push(entry);

    // Keep only last 20 actions
    if (this.recentActions.length > 20) {
      this.recentActions.shift();
    }
  }

  /**
   * Get recent actions
   */
  getRecentActions(count: number = 10): MemoryEntry[] {
    return this.recentActions.slice(-count);
  }

  /**
   * Clear recent actions
   */
  clearRecentActions(): void {
    this.recentActions = [];
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    selectorCache: { total: number; avgSuccessRate: number };
    episodes: { total: number; successRate: number };
    recentActions: number;
  } {
    const successfulEpisodes = this.episodes.filter(e => e.success).length;

    return {
      selectorCache: this.getCacheStats(),
      episodes: {
        total: this.episodes.length,
        successRate: this.episodes.length > 0 ? successfulEpisodes / this.episodes.length : 0,
      },
      recentActions: this.recentActions.length,
    };
  }
}

// Export singleton
export const memoryManager = new MemoryManager();
