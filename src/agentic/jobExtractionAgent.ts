/**
 * Job Extraction Agent - Vision-based job listing extraction
 */

import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { visionAgent } from './visionAgent';
import { JobListing } from '../types';

export class JobExtractionAgent {
  /**
   * Extract job listings from current page using vision
   */
  async extractJobsFromPage(page: Page): Promise<JobListing[]> {
    logger.info('📋 Extracting jobs from page using vision...');

    try {
      // Take screenshot
      const screenshot = await page.screenshot({ fullPage: true });

      // Analyze with vision
      const analysis = await visionAgent.analyzeScreen(screenshot);

      // Check if this looks like a job listing page
      const isJobPage =
        analysis.uiState === 'job_listing_page' ||
        analysis.description.toLowerCase().includes('job') ||
        analysis.pageType.toLowerCase().includes('job');

      if (!isJobPage) {
        logger.warn('Page does not appear to contain job listings', {
          uiState: analysis.uiState,
          pageType: analysis.pageType,
        });
        return [];
      }

      // Extract job data using structured extraction
      const jobs = await this.extractStructuredJobData(screenshot, page.url());

      logger.info(`✅ Extracted ${jobs.length} jobs from page`);

      return jobs;

    } catch (error) {
      logger.error('Failed to extract jobs', { error });
      return [];
    }
  }

  /**
   * Extract structured job data from screenshot
   */
  private async extractStructuredJobData(screenshot: Buffer, currentUrl?: string): Promise<JobListing[]> {
    logger.info('🔍 Extracting structured job data...');

    const base64Image = screenshot.toString('base64');

    const message = await visionAgent['client'].messages.create({
      model: visionAgent['model'],
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `Extract all job listings visible on this page.

For each job listing, extract:
- title: Job title
- company: Company name
- location: Job location (city, state, or "Remote")
- description: Brief description or summary (if visible)
- salary: Salary range (if mentioned, otherwise null)
- postedDate: When posted (e.g., "2 days ago", "Posted today", or null if not shown)
- jobType: Full-time, Part-time, Contract, etc. (if shown, otherwise null)
- applicationUrl: URL or link text to apply (if visible)

Return JSON array:
[
  {
    "id": "unique_id_or_index",
    "title": "Software Engineer",
    "company": "Example Corp",
    "location": "New York, NY",
    "description": "Brief description if visible...",
    "salary": "$100k-$150k" or null,
    "postedDate": "3 days ago" or null,
    "jobType": "Full-time" or null,
    "applicationUrl": "Apply link text or URL" or null
  }
]

IMPORTANT:
- Only extract visible job listings
- If a field is not visible, use null
- Be accurate with job titles and company names
- Include as much detail as you can see
- Minimum: title and company are required

If you cannot see any job listings, return an empty array: []

Return ONLY the JSON array, no markdown or explanations.`,
            },
          ],
        },
      ],
    });

    const response = message.content[0];
    if (response.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Parse JSON
    const jsonMatch = response.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn('No job listings found in vision response');
      return [];
    }

    const extractedJobs = JSON.parse(jsonMatch[0]);

    // Convert to JobListing format
    const jobs: JobListing[] = extractedJobs.map((job: any, index: number) => ({
      id: job.id || `vision-job-${Date.now()}-${index}`,
      title: job.title || 'Unknown Title',
      company: job.company || 'Unknown Company',
      location: job.location || 'Unknown Location',
      description: job.description || '',
      url: job.applicationUrl || currentUrl || '',
      postedDate: job.postedDate || null,
      salary: job.salary || null,
      jobType: job.jobType || null,
      scrapedAt: new Date().toISOString(),
    }));

    logger.info(`Converted ${jobs.length} raw extractions to JobListing format`);

    return jobs;
  }

  /**
   * Extract a single job detail from a job detail page
   */
  async extractJobDetail(page: Page): Promise<Partial<JobListing> | null> {
    logger.info('📄 Extracting job detail from page...');

    try {
      const screenshot = await page.screenshot({ fullPage: true });
      const base64Image = screenshot.toString('base64');

      const message = await visionAgent['client'].messages.create({
        model: visionAgent['model'],
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: `Extract detailed information from this job posting page.

Extract:
- title: Full job title
- company: Company name
- location: Location (city, state, or "Remote")
- description: Full job description (all visible text)
- requirements: Required skills/qualifications (as array of strings)
- responsibilities: Key responsibilities (as array of strings)
- benefits: Benefits mentioned (as array of strings)
- salary: Salary/compensation info
- jobType: Employment type (Full-time, Part-time, Contract, etc.)
- experience: Required experience level ("Entry", "Mid", "Senior", etc.)
- education: Education requirements
- postedDate: When posted

Return JSON:
{
  "title": "...",
  "company": "...",
  "location": "...",
  "description": "Full description text...",
  "requirements": ["skill1", "skill2", ...],
  "responsibilities": ["resp1", "resp2", ...],
  "benefits": ["benefit1", "benefit2", ...],
  "salary": "..." or null,
  "jobType": "..." or null,
  "experience": "..." or null,
  "education": "..." or null,
  "postedDate": "..." or null
}

Be thorough - extract ALL visible information. Return ONLY JSON.`,
              },
            ],
          },
        ],
      });

      const response = message.content[0];
      if (response.type !== 'text') {
        return null;
      }

      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('Failed to parse job detail');
        return null;
      }

      const detail = JSON.parse(jsonMatch[0]);

      logger.info('✅ Job detail extracted', {
        title: detail.title,
        company: detail.company,
      });

      return {
        ...detail,
        url: page.url(),
        scrapedAt: new Date().toISOString(),
      };

    } catch (error) {
      logger.error('Failed to extract job detail', { error });
      return null;
    }
  }

  /**
   * Check if current page has job listings
   */
  async hasJobListings(page: Page): Promise<boolean> {
    try {
      const screenshot = await page.screenshot();
      const analysis = await visionAgent.analyzeScreen(screenshot);

      return (
        analysis.uiState === 'job_listing_page' ||
        analysis.description.toLowerCase().includes('job listing') ||
        analysis.description.toLowerCase().includes('search results')
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Count visible job listings on page
   */
  async countJobsOnPage(page: Page): Promise<number> {
    try {
      const jobs = await this.extractJobsFromPage(page);
      return jobs.length;
    } catch (error) {
      return 0;
    }
  }
}

// Export singleton
export const jobExtractionAgent = new JobExtractionAgent();
