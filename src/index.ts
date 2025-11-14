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
import { exportJobsToExcel, JobWithMatch } from './utils/excelExport';
import { JobListing, PreparedApplication, AppliedJob } from './types';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

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

    // Rotational search across keyword × location combinations
    const allJobs: JobListing[] = [];

    outerLoop:
    for (const keyword of config.searchKeywords) {
      for (const location of config.searchLocations) {
        logger.info('Starting job search', { keyword, location });

        // Perform search with all filters applied via URL params
        await navigator.search(keyword, location, {
          radius: config.searchRadius,
          dateFilter: config.dateFilter,
          remoteFilter: config.remoteFilter,
          experienceLevel: config.experienceLevel,
        });

        // Collect limited pages per combo
        let pageCount = 0;
        const maxPages = config.maxPagesToExtract; // Configurable: number or -1 for all pages
        const extractAllPages = maxPages === -1;

        while (extractAllPages || pageCount < maxPages) {
          pageCount++;
          logger.info(`Processing page ${pageCount}${extractAllPages ? ' (extracting all pages)' : ` of max ${maxPages}`} for`, { keyword, location });

          const cards = await navigator.getJobCards();
          logger.info(`Found ${cards.length} job cards`);

          // Extract jobs from JSON data instead of parsing HTML elements
          const jobs = await parser.extractJobsFromJSON();
          logger.info(`Extracted ${jobs.length} jobs from page`);

          for (const jobInfo of jobs) {
            try {
              if (!jobInfo) continue;

              // Only process 1-Click Apply jobs
              if (!jobInfo.hasOneClickApply) {
                logger.debug('Skipping non-1-Click Apply job', { title: jobInfo.title });
                continue;
              }

              // Use description from JSON - no need to navigate to each job page!
              const fullJob = await parser.parseJobDetail(jobInfo);
              if (fullJob) {
                allJobs.push(fullJob);
                logger.info('Job added to list', {
                  title: fullJob.title,
                  company: fullJob.company,
                });
              }

              // Limit total jobs across entire run
              if (allJobs.length >= 50) {
                logger.info('Reached job limit (50)');
                break outerLoop;
              }
            } catch (error) {
              logger.error('Error processing job card', { error });
            }
          }

          // Check if there's a next page for this combo
          if (await navigator.hasNextPage() && (extractAllPages || pageCount < maxPages)) {
            await navigator.goToNextPage();
            // Small delay between pages to avoid rate limiting
            await page.waitForTimeout(2000);
          } else {
            const reason = !(await navigator.hasNextPage()) 
              ? 'No more pages available' 
              : `Reached page limit (${maxPages})`;
            logger.info(reason + ' for this combo');
            break;
          }
        }

        // Optional small delay between combos
        try {
          await page.waitForTimeout(1000);
        } catch (error) {
          logger.warn('Page closed during delay, exiting search loop', { error: error instanceof Error ? error.message : String(error) });
          break outerLoop;
        }

        // If we already have a good batch, proceed
        if (allJobs.length >= 50) break outerLoop;
      }
    }

    logger.info(`Collected ${allJobs.length} 1-Click Apply jobs in rotational search`);

    // Save jobs to storage
    if (allJobs.length > 0) {
      await jobStorage.saveJobs(allJobs);
    }

    // EXPORT TO EXCEL IMMEDIATELY (before matching, so we can see the data even if matching fails)
    logger.info('\n📊 Creating Excel export with extracted job data...');
    try {
      if (allJobs.length > 0) {
        // Convert to jobsWithMatches format (without match scores for now)
        const jobsForExport: JobWithMatch[] = allJobs.map(job => ({ job }));
        const excelPath = await exportJobsToExcel(jobsForExport);
        logger.info(`✅ Excel file created: ${excelPath}`);
        logger.info(`   Open this file to see all ${allJobs.length} extracted jobs!`);
      }
    } catch (error) {
      logger.error('Failed to create Excel export', { error });
    }

    // Close browser BEFORE matching (matching doesn't need browser)
    await browserManager.close();
    logger.info('🚪 Browser closed - now analyzing jobs with Claude AI...\n');

    // Match and prepare applications
    const preparedApplications: PreparedApplication[] = [];
    const jobsWithMatches: JobWithMatch[] = [];

    for (const job of allJobs) {
      let matchReport: any = undefined;
      try {
        logger.info('Processing job', { title: job.title, company: job.company });

        try {
          // Quick title check
          const titleMatch = await matcherAgent.matchTitle(job.title);
          logger.info('Title match', {
            title: job.title,
            score: titleMatch.score,
            threshold: config.titleMatchThreshold,
          });

          if (titleMatch.score < config.titleMatchThreshold) {
            logger.info('Title match too low, skipping', { title: job.title });
            jobsWithMatches.push({ job }); // Add to Excel even if rejected
            continue;
          }

          // Full description analysis
          matchReport = await matcherAgent.matchDescription(job);
          logger.info('Full match analysis', {
            title: job.title,
            overallScore: matchReport.overallScore,
            threshold: config.descriptionMatchThreshold,
          });

          jobsWithMatches.push({ job, match: matchReport }); // Add matched job

          if (matchReport.overallScore < config.descriptionMatchThreshold) {
            logger.info('Overall match too low, skipping', { title: job.title });
            continue;
          }
        } catch (matchError) {
          logger.warn('Matcher agent error, skipping matching for this job', {
            title: job.title,
            error: matchError instanceof Error ? matchError.message : String(matchError),
          });
          jobsWithMatches.push({ job }); // Add to Excel without match score
          continue; // Skip to next job instead of failing entire flow
        }

        // Job matches! Now detect and answer questions
        if (!matchReport) {
          logger.warn('No match report available, skipping application for', { title: job.title });
          continue;
        }

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

    // Save prepared applications to disk
    if (preparedApplications.length > 0) {
      try {
        const preparedDir = path.join(process.cwd(), 'data', 'applications', 'prepared');
        if (!fs.existsSync(preparedDir)) {
          fs.mkdirSync(preparedDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const preparedFilePath = path.join(preparedDir, `prepared-${timestamp}.json`);
        fs.writeFileSync(preparedFilePath, JSON.stringify(preparedApplications, null, 2));
        
        logger.info('✅ Prepared applications saved', {
          file: preparedFilePath,
          count: preparedApplications.length,
        });
      } catch (error) {
        logger.error('Failed to save prepared applications', { error });
      }
    }

    // Export all jobs to Excel BEFORE attempting further processing
    try {
      if (jobsWithMatches.length > 0) {
        const excelPath = await exportJobsToExcel(jobsWithMatches);
        logger.info(`✓ Excel export saved to: ${excelPath}`);
      }
    } catch (error) {
      logger.error('Failed to create Excel export', { error });
    }

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

    logger.info('\n✓ Session complete!');

  } catch (error) {
    logger.error('Fatal error', { error });
    console.error('FATAL ERROR DETAILS:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Ensure browser is closed on error
    try {
      await browserManager.close();
    } catch (closeError) {
      // Ignore close errors
    }
    
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
