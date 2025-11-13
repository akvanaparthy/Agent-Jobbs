import { config, isWithinOperatingHours, getNextOperatingTime } from './config/config';
import { logger } from './utils/logger';
import { browserManager } from './automation/browser';
import { ZipRecruiterNavigator } from './automation/zipRecruiterNav';
import { JobParser } from './automation/jobParser';
import { jobStorage } from './storage/jobStorage';
import { chromaDB } from './storage/chromaDB';
import { matcherAgent } from './agents/matcherAgent';
import { qaAgent } from './agents/qaAgent';
import { QuestionDetector } from './automation/questionDetector';
import { rateLimiter } from './config/rateLimiter';
import { applicationTracker } from './storage/applicationTracker';
import { JobListing, PreparedApplication, AppliedJob } from './types';
import * as crypto from 'crypto';

async function main() {
  logger.info('='.repeat(60));
  logger.info('Agent-Jobbs: Automated Job Application System');
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

    // Initialize ChromaDB
    logger.info('Initializing ChromaDB...');
    await chromaDB.initialize();

    const chromaStats = await chromaDB.getStats();
    logger.info('ChromaDB ready', chromaStats);

    if (chromaStats.resumeChunks === 0) {
      logger.error('No resume data found! Please run: npm run resume:process');
      return;
    }

    // Launch browser
    logger.info('Launching browser...');
    await browserManager.launch();

    // Load session
    const sessionLoaded = await browserManager.loadSession();

    if (!sessionLoaded) {
      logger.error('No valid session found! Please run: npm run auth:setup');
      await browserManager.close();
      return;
    }

    logger.info('Session loaded successfully');

    const page = browserManager.getPage();

    // Initialize navigators and parsers
    const navigator = new ZipRecruiterNavigator(page);
    const parser = new JobParser(page);

    // Perform job search
    logger.info('Starting job search', {
      keywords: config.searchKeywords.join(', '),
      location: config.searchLocation,
    });

    await navigator.search(
      config.searchKeywords.join(', '),
      config.searchLocation
    );

    // Apply date filter
    if (config.dateFilter !== 'any_time') {
      await navigator.applyDateFilter(config.dateFilter);
    }

    // Collect jobs from multiple pages
    const allJobs: JobListing[] = [];
    let pageCount = 0;
    const maxPages = 3; // Limit to 3 pages for MVP

    while (pageCount < maxPages) {
      pageCount++;
      logger.info(`Processing page ${pageCount}`);

      const cards = await navigator.getJobCards();
      logger.info(`Found ${cards.length} job cards`);

      for (const card of cards) {
        try {
          // Parse basic info from card
          const jobInfo = await parser.parseJobCard(card);

          if (!jobInfo) continue;

          // Only process 1-Click Apply jobs
          if (!jobInfo.hasOneClickApply) {
            logger.debug('Skipping non-1-Click Apply job', { title: jobInfo.title });
            continue;
          }

          // Navigate to job detail page and get full info
          if (jobInfo.url) {
            const fullJob = await parser.parseJobDetail(jobInfo);
            if (fullJob) {
              allJobs.push(fullJob);
              logger.info('Job added to list', {
                title: fullJob.title,
                company: fullJob.company,
              });
            }
          }

          // Limit total jobs to avoid overwhelming
          if (allJobs.length >= 20) {
            logger.info('Reached job limit (20)');
            break;
          }
        } catch (error) {
          logger.error('Error processing job card', { error });
        }
      }

      if (allJobs.length >= 20) break;

      // Check if there's a next page
      if (await navigator.hasNextPage()) {
        await navigator.goToNextPage();
      } else {
        break;
      }
    }

    logger.info(`Collected ${allJobs.length} 1-Click Apply jobs`);

    // Save jobs to storage
    if (allJobs.length > 0) {
      await jobStorage.saveJobs(allJobs);
    }

    // Match and prepare applications
    const preparedApplications: PreparedApplication[] = [];

    for (const job of allJobs) {
      try {
        logger.info('Processing job', { title: job.title, company: job.company });

        // Quick title check
        const titleMatch = await matcherAgent.matchTitle(job.title);
        logger.info('Title match', {
          title: job.title,
          score: titleMatch.score,
          threshold: config.titleMatchThreshold,
        });

        if (titleMatch.score < config.titleMatchThreshold) {
          logger.info('Title match too low, skipping', { title: job.title });
          continue;
        }

        // Full description analysis
        const matchReport = await matcherAgent.matchDescription(job);
        logger.info('Full match analysis', {
          title: job.title,
          overallScore: matchReport.overallScore,
          threshold: config.descriptionMatchThreshold,
        });

        if (matchReport.overallScore < config.descriptionMatchThreshold) {
          logger.info('Overall match too low, skipping', { title: job.title });
          continue;
        }

        // Job matches! Now detect and answer questions
        logger.info('Job matches! Preparing application', { title: job.title });

        // Navigate to job page
        await page.goto(job.url, { waitUntil: 'domcontentloaded' });

        const questionDetector = new QuestionDetector(page);

        // Click apply button
        const clicked = await questionDetector.clickApplyButton();

        if (!clicked) {
          logger.warn('Could not click apply button', { title: job.title });
          continue;
        }

        // Wait for application form
        const formDetected = await questionDetector.waitForApplicationForm();

        if (!formDetected) {
          logger.warn('No application form detected', { title: job.title });
          continue;
        }

        // Detect questions
        const questions = await questionDetector.detectQuestions();
        logger.info(`Detected ${questions.length} questions`);

        // Answer questions
        const answers = await qaAgent.answerQuestions(questions, job);

        // Check if any answers need user review
        const needsReview = answers.some(a => a.source === 'user_input_required');

        // Create prepared application
        const preparedApp: PreparedApplication = {
          id: `app_${crypto.randomBytes(8).toString('hex')}`,
          job,
          matchReport,
          questions,
          answers,
          needsReview,
          createdAt: new Date().toISOString(),
        };

        preparedApplications.push(preparedApp);

        logger.info('Application prepared', {
          title: job.title,
          needsReview,
        });

        // Close modal/go back
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);

      } catch (error) {
        logger.error('Error processing job', { error, jobTitle: job.title });
      }
    }

    logger.info(`\nPrepared ${preparedApplications.length} applications`);

    // Display summary
    if (preparedApplications.length > 0) {
      logger.info('\n' + '='.repeat(60));
      logger.info('PREPARED APPLICATIONS SUMMARY');
      logger.info('='.repeat(60));

      preparedApplications.forEach((app, index) => {
        logger.info(`\n${index + 1}. ${app.job.title} at ${app.job.company}`);
        logger.info(`   Match Score: ${(app.matchReport.overallScore * 100).toFixed(0)}%`);
        logger.info(`   Questions: ${app.questions.length}`);
        logger.info(`   Needs Review: ${app.needsReview ? 'YES' : 'NO'}`);
      });

      logger.info('\n' + '='.repeat(60));

      if (config.dryRun) {
        logger.info('\n🔍 DRY RUN MODE: No applications will be submitted.');
        logger.info('To actually apply, set DRY_RUN=false in .env');
      } else {
        logger.info('\n✓ Applications ready for review!');
        logger.info('Review and submit using the CLI interface (coming soon)');
      }
    } else {
      logger.info('\n😞 No matching jobs found.');
      logger.info('Try adjusting your search keywords or thresholds.');
    }

    // Clean up
    await browserManager.close();

    logger.info('\n✓ Session complete!');

  } catch (error) {
    logger.error('Fatal error', { error });
    await browserManager.close();
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
