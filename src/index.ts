import { config, isWithinOperatingHours, getNextOperatingTime } from './config/config';
import { logger } from './utils/logger';
import { runScrapeMode } from './modes/scrapeMode';
import { runInteractiveMode } from './modes/interactiveMode';

async function main() {
  logger.info('='.repeat(60));
  logger.info('Agent-Jobbs: Automated Job Application System');
  logger.info(`Mode: ${config.applicationMode.toUpperCase()}`);
  logger.info('='.repeat(60));

  try {
    // Check operating hours
    if (!isWithinOperatingHours()) {
      const nextTime = getNextOperatingTime();
      logger.warn('Outside operating hours', {
        currentHour: new Date().getHours(),
        nextAvailable: nextTime.toISOString(),
      });

      if (!config.dryRun) {
        logger.info('Exiting. Will resume during operating hours.');
        return;
      }
    }

    // Route to appropriate mode
    if (config.applicationMode === 'scrape') {
      await runScrapeMode();
    } else {
      await runInteractiveMode();
    }

  } catch (error) {
    logger.error('Fatal error', { error });
    console.error('FATAL ERROR DETAILS:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      logger.error('Unhandled error', { error });
      process.exit(1);
    });
}

export default main;
