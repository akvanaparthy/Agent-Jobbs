import { config } from '../config/config';
import { logger } from '../utils/logger';
import { browserManager } from '../automation/browser';
import { ZipRecruiterNavigator } from '../automation/zipRecruiterNav';
import { JobParser } from '../automation/jobParser';
import { jobStorage } from '../storage/jobStorage';
import { chromaDB } from '../storage/chromaDB';
import { matcherAgent } from '../agents/matcherAgent';
import { qaAgent } from '../agents/qaAgent';
import { applicationTracker } from '../storage/applicationTracker';
import { exportJobsToExcel, JobWithMatch } from '../utils/excelExport';
import { exportAppliedJobs, exportFailedJobs } from '../utils/multiExcelExport';
import { InteractiveApplicationFlow } from '../flows/interactiveApplicationFlow';
import { JobListing, AppliedJob } from '../types';

/**
 * INTERACTIVE MODE: Fetch jobs, match with AI, apply to high-scoring jobs
 */
export async function runInteractiveMode() {
  logger.info('🚀 INTERACTIVE MODE: Will apply to high-scoring jobs');

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

  // Match and filter jobs
  logger.info('\n🤖 Matching jobs with AI...\n');
  const jobsWithMatches: JobWithMatch[] = [];

  for (const job of allJobs) {
    try {
      const matchReport = await matcherAgent.matchDescription(job);
      logger.info(`${job.title}: ${(matchReport.overallScore * 100).toFixed(0)}%`);
      jobsWithMatches.push({ job, match: matchReport });
    } catch (error) {
      logger.warn('Matcher error', { title: job.title, error });
      jobsWithMatches.push({ job });
    }
  }

  // Filter by min score and sort
  const minScore = config.minApplyScore / 100;
  const highScoringJobs = jobsWithMatches
    .filter(jm => jm.match && jm.match.overallScore >= minScore)
    .sort((a, b) => (b.match?.overallScore || 0) - (a.match?.overallScore || 0));

  logger.info(`\n${highScoringJobs.length} jobs meet minimum score (${config.minApplyScore}%)`);

  // Apply to high-scoring jobs
  const appliedJobs: AppliedJob[] = [];
  const failedJobs: Array<{ job: JobListing; match: any; error: string }> = [];
  const applicationFlow = new InteractiveApplicationFlow(page, qaAgent, applicationTracker);

  // Check rate limit before starting
  const todayCount = applicationTracker.getTodayApplications().length;
  const maxDaily = config.maxApplicationsPerDay;

  if (todayCount >= maxDaily) {
    logger.warn(`Daily application limit reached (${todayCount}/${maxDaily}). Stopping.`);
  }

  for (let i = 0; i < highScoringJobs.length; i++) {
    // Enforce rate limit
    const currentCount = applicationTracker.getTodayApplications().length;
    if (currentCount >= maxDaily) {
      logger.warn(`Reached daily limit (${maxDaily}). Stopping applications.`);
      break;
    }

    const { job, match } = highScoringJobs[i];

    logger.info(`\n${'='.repeat(80)}`);
    logger.info(`Applying to job ${i + 1}/${highScoringJobs.length}`);
    logger.info(`${job.title} at ${job.company} (${(match!.overallScore * 100).toFixed(0)}%)`);
    logger.info('='.repeat(80));

    try {
      // Navigate to job page to find the apply button
      await page.goto(job.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const listingKey = job.listingKey;
      if (!listingKey) {
        const errorMsg = 'No listing_key found - cannot proceed with application';
        logger.error(errorMsg, { jobId: job.id, jobTitle: job.title });
        failedJobs.push({ job, match, error: errorMsg });
        continue; // Skip to next job
      }

      logger.info(`Listing key: ${listingKey}`);

      // Apply using API-based flow (button should be on job detail page)
      const result = await applicationFlow.applyToJob(job, match!, listingKey);

      if (result.applied && result.appliedJob) {
        appliedJobs.push(result.appliedJob);
        logger.info('✓ Application submitted!');
      } else {
        failedJobs.push({ job, match, error: result.error || 'Unknown error' });
        logger.warn(`⚠ Application failed: ${result.error}`);
      }

      // Small delay between applications
      await page.waitForTimeout(3000);

    } catch (error: any) {
      logger.error('Error applying to job', { error: error.message });
      failedJobs.push({ job, match, error: error.message });
    }
  }

  // Close browser
  await browserManager.close();

  // Export results to multiple Excel files
  logger.info('\n📊 Creating Excel exports...');

  // 1. Export all jobs with matches (original format)
  if (jobsWithMatches.length > 0) {
    const allJobsPath = await exportJobsToExcel(jobsWithMatches);
    logger.info(`✅ All jobs: ${allJobsPath}`);
  }

  // 2. Export applied jobs
  if (appliedJobs.length > 0) {
    const appliedPath = await exportAppliedJobs(appliedJobs);
    logger.info(`✅ Applied jobs: ${appliedPath}`);
  }

  // 3. Export failed jobs
  if (failedJobs.length > 0) {
    const failedPath = await exportFailedJobs(failedJobs);
    logger.info(`✅ Failed applications: ${failedPath}`);
  }

  // Summary
  logger.info('\n' + '='.repeat(80));
  logger.info('SUMMARY');
  logger.info('='.repeat(80));
  logger.info(`Total jobs collected: ${allJobs.length}`);
  logger.info(`Jobs matched (>=${minScore * 100}%): ${highScoringJobs.length}`);
  logger.info(`Applications submitted: ${appliedJobs.length}`);
  logger.info(`Applications failed: ${failedJobs.length}`);

  if (appliedJobs.length > 0) {
    logger.info('\n✅ Applied to:');
    appliedJobs.forEach((app, idx) => {
      logger.info(`  ${idx + 1}. ${app.job?.title} at ${app.job?.company}`);
    });
  }

  if (failedJobs.length > 0) {
    logger.info('\n⚠ Failed applications:');
    failedJobs.forEach((f, idx) => {
      logger.info(`  ${idx + 1}. ${f.job.title}: ${f.error}`);
    });
  }

  logger.info('\n✓ Session complete!');
}
