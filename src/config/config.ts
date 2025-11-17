import * as dotenv from 'dotenv';
import { z } from 'zod';
import { AppConfig } from '../types';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Zod schema for configuration validation
const configSchema = z.object({
  anthropicApiKey: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  searchKeywords: z.string().min(1).transform(str => str.split(/[;,]/).map(s => s.trim()).filter(Boolean)),
  searchLocations: z.string().min(1).transform(str => str.split(/[;,]/).map(s => s.trim()).filter(Boolean)),
  searchPagesPerCombo: z.string().transform(Number).pipe(z.number().positive()),
  maxPagesToExtract: z.string().transform(str => {
    const lower = str.toLowerCase().trim();
    if (lower === 'all' || lower === 'unlimited') return -1;
    const num = Number(str);
    if (isNaN(num) || num < 1) return 15; // Default to 15 if invalid
    return num;
  }).pipe(z.number()),
  titleMatchThreshold: z.string().transform(Number).pipe(z.number().min(0).max(1)),
  descriptionMatchThreshold: z.string().transform(Number).pipe(z.number().min(0).max(1)),
  dateFilter: z.enum(['past_day', 'past_week', 'past_month', 'any_time']),
  searchRadius: z.string().transform(Number).pipe(z.number().positive()).optional().default('25'),
  remoteFilter: z.enum(['all', 'no_remote', 'only_remote']).optional().default('all'),
  experienceLevel: z.enum(['all', 'senior', 'mid', 'junior', 'no_experience']).optional().default('all'),
  maxApplicationsPerDay: z.string().transform(Number).pipe(z.number().positive()),
  minDelayBetweenAppsMs: z.string().transform(Number).pipe(z.number().positive()),
  maxDelayBetweenAppsMs: z.string().transform(Number).pipe(z.number().positive()),
  operationStartHour: z.string().transform(Number).pipe(z.number().min(0).max(23)),
  operationEndHour: z.string().transform(Number).pipe(z.number().min(0).max(23)),
  dryRun: z.string().transform(str => str.toLowerCase() === 'true'),
  chromaDbPath: z.string().min(1),
  chromaDbHost: z.string().min(1),
  chromaDbPort: z.string().transform(Number).pipe(z.number().positive()),
  headless: z.string().transform(str => str.toLowerCase() === 'true'),
  browserTimeout: z.string().transform(Number).pipe(z.number().positive()),
  usePersistentContext: z.string().transform(str => str.toLowerCase() === 'true').optional().default('false'),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']),
  logToFile: z.string().transform(str => str.toLowerCase() === 'true'),
  claudeModel: z.string().min(1),
  candidateExperienceYears: z.string().optional().default('0-3'),
  applicationMode: z.enum(['scrape', 'interactive']).optional().default('scrape'),
  autoApproveConfidence: z.string().transform(Number).pipe(z.number().min(0).max(100)).optional().default('65'),
  minApplyScore: z.string().transform(Number).pipe(z.number().min(0).max(100)).optional().default('60'),
});

// Load and validate configuration
function loadConfig(): AppConfig {
  // Ensure .env is loaded
  if (!process.env.ANTHROPIC_API_KEY) {
    const envPath = require('path').resolve(process.cwd(), '.env');
    const fs = require('fs');
    if (fs.existsSync(envPath)) {
      logger.warn('Re-loading .env file');
      dotenv.config({ override: true });
    }
  }

  const rawConfig = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    searchKeywords: process.env.SEARCH_KEYWORDS || 'software engineer',
    // Prefer SEARCH_LOCATIONS; fall back to SEARCH_LOCATION for backward compatibility
    searchLocations: process.env.SEARCH_LOCATIONS || process.env.SEARCH_LOCATION || 'San Francisco, CA',
    searchPagesPerCombo: process.env.SEARCH_PAGES_PER_COMBO || '1',
    maxPagesToExtract: process.env.MAX_PAGES_TO_EXTRACT || '15',
    titleMatchThreshold: process.env.TITLE_MATCH_THRESHOLD || '0.6',
    descriptionMatchThreshold: process.env.DESCRIPTION_MATCH_THRESHOLD || '0.7',
    dateFilter: process.env.DATE_FILTER || 'past_week',
    searchRadius: process.env.SEARCH_RADIUS || '25',
    remoteFilter: process.env.REMOTE_FILTER || 'all',
    experienceLevel: process.env.EXPERIENCE_LEVEL || 'all',
    maxApplicationsPerDay: process.env.MAX_APPLICATIONS_PER_DAY || '30',
    minDelayBetweenAppsMs: process.env.MIN_DELAY_BETWEEN_APPS_MS || '480000',
    maxDelayBetweenAppsMs: process.env.MAX_DELAY_BETWEEN_APPS_MS || '1200000',
    operationStartHour: process.env.OPERATION_START_HOUR || '9',
    operationEndHour: process.env.OPERATION_END_HOUR || '18',
    dryRun: process.env.DRY_RUN || 'true',
    chromaDbPath: process.env.CHROMA_DB_PATH || './data/chromadb',
    chromaDbHost: process.env.CHROMA_DB_HOST || 'localhost',
    chromaDbPort: process.env.CHROMA_DB_PORT || '8000',
    headless: process.env.HEADLESS || 'false',
    browserTimeout: process.env.BROWSER_TIMEOUT || '30000',
    usePersistentContext: process.env.USE_PERSISTENT_CONTEXT || 'false',
    logLevel: process.env.LOG_LEVEL || 'info',
    logToFile: process.env.LOG_TO_FILE || 'true',
    claudeModel: process.env.CLAUDE_MODEL || 'claude-3-5-haiku-20241022',
    candidateExperienceYears: process.env.CANDIDATE_EXPERIENCE_YEARS || '0-3',
    applicationMode: process.env.APPLICATION_MODE || 'scrape',
    autoApproveConfidence: process.env.AUTO_APPROVE_CONFIDENCE || '65',
    minApplyScore: process.env.MIN_APPLY_SCORE || '60',
  };

  try {
    const validated = configSchema.parse(rawConfig);

    // Resolve relative paths to absolute
    if (!path.isAbsolute(validated.chromaDbPath)) {
      validated.chromaDbPath = path.resolve(process.cwd(), validated.chromaDbPath);
    }

    return validated as AppConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:');
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      throw new Error('Invalid configuration. Please check your .env file.');
    }
    throw error;
  }
}

// Export singleton config instance
export const config = loadConfig();

// Helper functions
export function isWithinOperatingHours(): boolean {
  const now = new Date();
  const currentHour = now.getHours();
  return currentHour >= config.operationStartHour && currentHour < config.operationEndHour;
}

export function getNextOperatingTime(): Date {
  const now = new Date();
  const currentHour = now.getHours();

  if (currentHour < config.operationStartHour) {
    // Start today
    now.setHours(config.operationStartHour, 0, 0, 0);
    return now;
  } else {
    // Start tomorrow
    now.setDate(now.getDate() + 1);
    now.setHours(config.operationStartHour, 0, 0, 0);
    return now;
  }
}

export function getRandomDelay(): number {
  const min = config.minDelayBetweenAppsMs;
  const max = config.maxDelayBetweenAppsMs;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
