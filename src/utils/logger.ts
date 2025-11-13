import winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../config/config';

// Ensure logs directory exists
const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = `\n${JSON.stringify(meta, null, 2)}`;
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports
const transports: winston.transport[] = [
  // Console transport (always enabled)
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

// Add file transports if enabled
if (config.logToFile) {
  transports.push(
    // All logs
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    // Error logs only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: config.logLevel,
  transports,
  // Prevent uncaught exceptions from crashing the app
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: fileFormat,
    }),
  ],
  // Prevent unhandled rejections from crashing the app
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: fileFormat,
    }),
  ],
});

// Helper functions for common log patterns
export const logJobFound = (job: { title: string; company: string; id: string }) => {
  logger.info('Job found', {
    jobId: job.id,
    title: job.title,
    company: job.company,
  });
};

export const logJobMatched = (
  job: { title: string; company: string; id: string },
  score: number
) => {
  logger.info('Job matched', {
    jobId: job.id,
    title: job.title,
    company: job.company,
    matchScore: score,
  });
};

export const logJobRejected = (
  job: { title: string; company: string; id: string },
  reason: string
) => {
  logger.info('Job rejected', {
    jobId: job.id,
    title: job.title,
    company: job.company,
    reason,
  });
};

export const logApplicationStarted = (job: { title: string; company: string; id: string }) => {
  logger.info('Application started', {
    jobId: job.id,
    title: job.title,
    company: job.company,
  });
};

export const logApplicationCompleted = (
  job: { title: string; company: string; id: string },
  success: boolean
) => {
  const level = success ? 'info' : 'warn';
  logger.log(level, 'Application completed', {
    jobId: job.id,
    title: job.title,
    company: job.company,
    success,
  });
};

export const logError = (operation: string, error: Error) => {
  logger.error(`Error in ${operation}`, {
    operation,
    error: error.message,
    stack: error.stack,
  });
};

export const logRateLimit = (message: string, nextAvailable?: Date) => {
  logger.warn('Rate limit', {
    message,
    nextAvailable: nextAvailable?.toISOString(),
  });
};

// Export the logger as default
export default logger;
