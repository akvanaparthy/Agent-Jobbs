import { config } from '../config/config';
import { logger } from '../utils/logger';
import { browserManager } from '../automation/browser';
import { ZipRecruiterNavigator } from '../automation/zipRecruiterNav';
import { JobParser } from '../automation/jobParser';
import { jobStorage } from '../storage/jobStorage';
import { chromaDB } from '../storage/chromaDB';
import { matcherAgent } from '../agents/matcherAgent';
import { exportJobsToExcel, JobWithMatch } from '../utils/excelExport';
import { JobListing } from '../types';

/**
 * SCRAPE MODE: Fetch jobs, match with AI, save to Excel (no applications)
 */
export async function runScrapeMode() {
  logger.info('🔍 SCRAPE MODE: Fetching and analyzing jobs only');

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

  const sessionLoaded = await browserManager.loadSession();

  if (!sessionLoaded) {
    logger.error('No valid session found! Please run: npm run auth:setup');
    await browserManager.close();
    return;
  }

  logger.info('Session loaded successfully');

  const page = browserManager.getPage();
  const navigator = new ZipRecruiterNavigator(page);
  const parser = new JobParser(page);

  // Fetch jobs
  const allJobs: JobListing[] = [];
  const maxPages = 1; // From config or hardcoded for testing

  outerLoop:
  for (const keyword of config.searchKeywords) {
    for (const location of config.searchLocations) {
      logger.info('Starting job search', { keyword, location });

      await navigator.search(keyword, location, {
        radius: config.searchRadius,
        dateFilter: config.dateFilter,
        remoteFilter: config.remoteFilter,
        experienceLevel: config.experienceLevel,
      });

      let pageCount = 0;

      while (pageCount < maxPages) {
        pageCount++;
        logger.info(`Processing page ${pageCount} of ${maxPages}`, { keyword, location });

        const jobs = await parser.extractJobsFromJSON();
        logger.info(`Extracted ${jobs.length} jobs from page`);

        for (const jobInfo of jobs) {
          try {
            if (!jobInfo || !jobInfo.hasOneClickApply) continue;

            const fullJob = await parser.parseJobDetail(jobInfo);
            if (fullJob) {
              allJobs.push(fullJob);
              logger.info('Job added', { title: fullJob.title, company: fullJob.company });
            }

            if (allJobs.length >= 50) {
              logger.info('Reached job limit (50)');
              break outerLoop;
            }
          } catch (error) {
            logger.error('Error processing job card', { error });
          }
        }

        if (await navigator.hasNextPage() && pageCount < maxPages) {
          await navigator.goToNextPage();
          await page.waitForTimeout(2000);
        } else {
          break;
        }
      }

      if (allJobs.length >= 50) break outerLoop;
    }
  }

  logger.info(`Collected ${allJobs.length} 1-Click Apply jobs`);

  // Save jobs
  if (allJobs.length > 0) {
    await jobStorage.saveJobs(allJobs);
  }

  // Match jobs with AI
  logger.info('\n🤖 Matching jobs with AI...\n');
  const jobsWithMatches: JobWithMatch[] = [];

  let rateLimitDetected = false;
  for (const job of allJobs) {
    try {
      const matchReport = await matcherAgent.matchDescription(job);

      // Check if rate limit was hit
      if (matchReport.reasoning.includes('API rate limit')) {
        logger.error('\n❌ CRITICAL: Anthropic API rate limit reached!');
        logger.error('All subsequent jobs will have 0% match score.');
        logger.error('Solutions:');
        logger.error('  1. Wait until rate limit resets (check error message for date)');
        logger.error('  2. Use a different ANTHROPIC_API_KEY in .env file');
        logger.error('  3. Upgrade your Anthropic API tier\n');
        rateLimitDetected = true;
      }

      logger.info(`${job.title}: ${(matchReport.overallScore * 100).toFixed(0)}%`);
      jobsWithMatches.push({ job, match: matchReport });

      // Stop trying after rate limit detected (all will fail)
      if (rateLimitDetected) {
        logger.warn(`Skipping remaining ${allJobs.length - jobsWithMatches.length} jobs due to rate limit`);
        // Add remaining jobs without matches
        for (let i = jobsWithMatches.length; i < allJobs.length; i++) {
          jobsWithMatches.push({ job: allJobs[i] });
        }
        break;
      }
    } catch (error) {
      logger.warn('Matcher error', { title: job.title, error });
      jobsWithMatches.push({ job });
    }
  }

  // Close browser
  await browserManager.close();

  // Export to Excel
  if (jobsWithMatches.length > 0) {
    const excelPath = await exportJobsToExcel(jobsWithMatches);
    logger.info(`✅ Excel saved: ${excelPath}`);
  }

  // Summary
  logger.info('\n' + '='.repeat(80));
  logger.info('SUMMARY');
  logger.info('='.repeat(80));
  logger.info(`Total jobs: ${allJobs.length}`);
  logger.info(`Matched (>=${config.descriptionMatchThreshold * 100}%): ${jobsWithMatches.filter(j => j.match && j.match.overallScore >= config.descriptionMatchThreshold).length}`);
  logger.info('\n✓ Scrape complete!');
}
