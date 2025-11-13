import * as fs from 'fs';
import * as path from 'path';
import { JobListing } from '../types';
import { logger } from '../utils/logger';
import { PATHS } from '../config/constants';

export class JobStorage {
  private jobsDir: string;
  private jobIndex: Map<string, string>; // jobId -> filepath

  constructor(jobsDir: string = PATHS.JOBS_DIR) {
    this.jobsDir = path.resolve(process.cwd(), jobsDir);
    this.jobIndex = new Map();
    this.ensureDirectoryExists();
    this.buildIndex();
  }

  /**
   * Ensure jobs directory exists
   */
  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.jobsDir)) {
      fs.mkdirSync(this.jobsDir, { recursive: true });
    }
  }

  /**
   * Build index of existing jobs
   */
  private buildIndex(): void {
    try {
      const files = fs.readdirSync(this.jobsDir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        const filepath = path.join(this.jobsDir, file);
        const content = fs.readFileSync(filepath, 'utf-8');
        const jobs: JobListing[] = JSON.parse(content);

        jobs.forEach(job => {
          this.jobIndex.set(job.id, filepath);
        });
      }

      logger.info('Job index built', {
        totalJobs: this.jobIndex.size,
        files: files.length,
      });
    } catch (error) {
      logger.error('Failed to build job index', { error });
    }
  }

  /**
   * Save jobs to a new file
   */
  async saveJobs(jobs: JobListing[]): Promise<string> {
    try {
      if (jobs.length === 0) {
        logger.warn('No jobs to save');
        return '';
      }

      // Filter out duplicates
      const uniqueJobs = this.filterDuplicates(jobs);

      if (uniqueJobs.length === 0) {
        logger.info('All jobs are duplicates, nothing to save');
        return '';
      }

      // Generate filename
      const timestamp = Date.now();
      const date = new Date().toISOString().split('T')[0];
      const filename = `jobs-${date}-${timestamp}.json`;
      const filepath = path.join(this.jobsDir, filename);

      // Save to file
      fs.writeFileSync(filepath, JSON.stringify(uniqueJobs, null, 2));

      // Update index
      uniqueJobs.forEach(job => {
        this.jobIndex.set(job.id, filepath);
      });

      logger.info('Jobs saved', {
        file: filename,
        total: uniqueJobs.length,
        duplicatesFiltered: jobs.length - uniqueJobs.length,
      });

      return filepath;
    } catch (error) {
      logger.error('Failed to save jobs', { error });
      throw error;
    }
  }

  /**
   * Load all jobs from directory
   */
  loadAllJobs(): JobListing[] {
    try {
      const allJobs: JobListing[] = [];
      const files = fs.readdirSync(this.jobsDir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        const filepath = path.join(this.jobsDir, file);
        const content = fs.readFileSync(filepath, 'utf-8');
        const jobs: JobListing[] = JSON.parse(content);
        allJobs.push(...jobs);
      }

      logger.info(`Loaded ${allJobs.length} jobs from ${files.length} files`);
      return allJobs;
    } catch (error) {
      logger.error('Failed to load jobs', { error });
      return [];
    }
  }

  /**
   * Load jobs from a specific file
   */
  loadJobsFromFile(filepath: string): JobListing[] {
    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to load jobs from file', { filepath, error });
      return [];
    }
  }

  /**
   * Get job by ID
   */
  getJobById(jobId: string): JobListing | null {
    try {
      const filepath = this.jobIndex.get(jobId);
      if (!filepath) {
        return null;
      }

      const jobs = this.loadJobsFromFile(filepath);
      return jobs.find(job => job.id === jobId) || null;
    } catch (error) {
      logger.error('Failed to get job by ID', { jobId, error });
      return null;
    }
  }

  /**
   * Check if job exists (by ID)
   */
  jobExists(jobId: string): boolean {
    return this.jobIndex.has(jobId);
  }

  /**
   * Filter out duplicate jobs
   */
  private filterDuplicates(jobs: JobListing[]): JobListing[] {
    return jobs.filter(job => !this.jobExists(job.id));
  }

  /**
   * Get jobs with 1-Click Apply
   */
  getOneClickApplyJobs(): JobListing[] {
    const allJobs = this.loadAllJobs();
    return allJobs.filter(job => job.hasOneClickApply);
  }

  /**
   * Get recent jobs (from last N days)
   */
  getRecentJobs(days: number = 7): JobListing[] {
    const allJobs = this.loadAllJobs();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return allJobs.filter(job => {
      const scrapedDate = new Date(job.scrapedAt);
      return scrapedDate >= cutoffDate;
    });
  }

  /**
   * Delete old job files
   */
  deleteOldJobs(days: number = 30): number {
    try {
      const files = fs.readdirSync(this.jobsDir).filter(f => f.endsWith('.json'));
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      let deletedCount = 0;

      for (const file of files) {
        const filepath = path.join(this.jobsDir, file);
        const stats = fs.statSync(filepath);

        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filepath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        this.buildIndex(); // Rebuild index
        logger.info(`Deleted ${deletedCount} old job files`);
      }

      return deletedCount;
    } catch (error) {
      logger.error('Failed to delete old jobs', { error });
      return 0;
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalJobs: number;
    oneClickApplyJobs: number;
    files: number;
    oldestJob: string | null;
    newestJob: string | null;
  } {
    const allJobs = this.loadAllJobs();
    const files = fs.readdirSync(this.jobsDir).filter(f => f.endsWith('.json'));

    const sortedByDate = [...allJobs].sort(
      (a, b) => new Date(a.scrapedAt).getTime() - new Date(b.scrapedAt).getTime()
    );

    return {
      totalJobs: allJobs.length,
      oneClickApplyJobs: allJobs.filter(j => j.hasOneClickApply).length,
      files: files.length,
      oldestJob: sortedByDate[0]?.scrapedAt || null,
      newestJob: sortedByDate[sortedByDate.length - 1]?.scrapedAt || null,
    };
  }

  /**
   * Export jobs to CSV
   */
  exportToCSV(jobs: JobListing[], outputPath: string): void {
    try {
      const headers = [
        'ID',
        'Title',
        'Company',
        'Location',
        'Salary',
        'Posted Date',
        'URL',
        'Has 1-Click Apply',
        'Scraped At',
      ];

      const rows = jobs.map(job => [
        job.id,
        job.title,
        job.company,
        job.location,
        job.salary || 'N/A',
        job.postedDate,
        job.url,
        job.hasOneClickApply ? 'Yes' : 'No',
        job.scrapedAt,
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row =>
          row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');

      fs.writeFileSync(outputPath, csvContent);
      logger.info('Jobs exported to CSV', { outputPath, count: jobs.length });
    } catch (error) {
      logger.error('Failed to export jobs to CSV', { error });
      throw error;
    }
  }
}

// Export singleton instance
export const jobStorage = new JobStorage();
