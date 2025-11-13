import * as fs from 'fs';
import * as path from 'path';
import { AppliedJob, ApplicationStats } from '../types';
import { logger } from '../utils/logger';
import { PATHS } from '../config/constants';

export class ApplicationTracker {
  private appliedDir: string;
  private preparedDir: string;

  constructor() {
    this.appliedDir = path.resolve(process.cwd(), PATHS.APPLICATIONS_APPLIED_DIR);
    this.preparedDir = path.resolve(process.cwd(), PATHS.APPLICATIONS_PREPARED_DIR);
    this.ensureDirectories();
  }

  /**
   * Ensure directories exist
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.appliedDir)) {
      fs.mkdirSync(this.appliedDir, { recursive: true });
    }
    if (!fs.existsSync(this.preparedDir)) {
      fs.mkdirSync(this.preparedDir, { recursive: true });
    }
  }

  /**
   * Record an application
   */
  async recordApplication(application: AppliedJob): Promise<void> {
    try {
      const date = new Date().toISOString().split('T')[0];
      const filepath = path.join(this.appliedDir, `applied-${date}.json`);

      // Load existing applications for the day
      let applications: AppliedJob[] = [];
      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, 'utf-8');
        applications = JSON.parse(content);
      }

      // Add new application
      applications.push(application);

      // Save
      fs.writeFileSync(filepath, JSON.stringify(applications, null, 2));

      logger.info('Application recorded', {
        id: application.id,
        jobTitle: application.title,
        company: application.company,
      });
    } catch (error) {
      logger.error('Failed to record application', { error });
      throw error;
    }
  }

  /**
   * Get all applied jobs
   */
  getAllApplications(): AppliedJob[] {
    try {
      const files = fs.readdirSync(this.appliedDir).filter(f => f.endsWith('.json'));

      const allApplications: AppliedJob[] = [];

      for (const file of files) {
        const filepath = path.join(this.appliedDir, file);
        const content = fs.readFileSync(filepath, 'utf-8');
        const applications: AppliedJob[] = JSON.parse(content);
        allApplications.push(...applications);
      }

      // Sort by date (newest first)
      allApplications.sort(
        (a, b) => new Date(b.appliedDate).getTime() - new Date(a.appliedDate).getTime()
      );

      return allApplications;
    } catch (error) {
      logger.error('Failed to get applications', { error });
      return [];
    }
  }

  /**
   * Get applications for today
   */
  getTodayApplications(): AppliedJob[] {
    const today = new Date().toISOString().split('T')[0];
    const filepath = path.join(this.appliedDir, `applied-${today}.json`);

    try {
      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, 'utf-8');
        return JSON.parse(content);
      }
      return [];
    } catch (error) {
      logger.error('Failed to get today applications', { error });
      return [];
    }
  }

  /**
   * Update application status
   */
  async updateStatus(applicationId: string, status: AppliedJob['status'], notes?: string): Promise<boolean> {
    try {
      const allApplications = this.getAllApplications();
      let found = false;

      for (const app of allApplications) {
        if (app.id === applicationId) {
          app.status = status;
          if (notes) {
            app.notes = notes;
          }
          found = true;
          break;
        }
      }

      if (!found) {
        logger.warn('Application not found', { applicationId });
        return false;
      }

      // Re-save all applications
      await this.resaveApplications(allApplications);

      logger.info('Application status updated', { applicationId, status });
      return true;
    } catch (error) {
      logger.error('Failed to update status', { error });
      return false;
    }
  }

  /**
   * Re-save applications (after update)
   */
  private async resaveApplications(applications: AppliedJob[]): Promise<void> {
    // Group by date
    const byDate = new Map<string, AppliedJob[]>();

    for (const app of applications) {
      const date = app.appliedDate;
      if (!byDate.has(date)) {
        byDate.set(date, []);
      }
      byDate.get(date)!.push(app);
    }

    // Save each date's applications
    for (const [date, apps] of byDate.entries()) {
      const filepath = path.join(this.appliedDir, `applied-${date}.json`);
      fs.writeFileSync(filepath, JSON.stringify(apps, null, 2));
    }
  }

  /**
   * Get application statistics
   */
  getStats(): ApplicationStats {
    const allApplications = this.getAllApplications();
    const todayApplications = this.getTodayApplications();

    const statusBreakdown = allApplications.reduce((acc, app) => {
      acc[app.status] = (acc[app.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const matchScores = allApplications.map(app => app.matchScore).filter(score => score > 0);
    const averageMatchScore =
      matchScores.length > 0
        ? matchScores.reduce((sum, score) => sum + score, 0) / matchScores.length
        : 0;

    return {
      totalApplications: allApplications.length,
      applicationsToday: todayApplications.length,
      averageMatchScore: Math.round(averageMatchScore * 100) / 100,
      statusBreakdown,
      recentApplications: allApplications.slice(0, 10),
    };
  }

  /**
   * Export applications to CSV
   */
  exportToCSV(outputPath: string): void {
    try {
      const applications = this.getAllApplications();

      const headers = [
        'ID',
        'Job ID',
        'Title',
        'Company',
        'URL',
        'Applied Date',
        'Applied Time',
        'Match Score',
        'Salary',
        'Status',
        'Notes',
      ];

      const rows = applications.map(app => [
        app.id,
        app.jobId,
        app.title,
        app.company,
        app.url,
        app.appliedDate,
        app.appliedTime,
        app.matchScore.toString(),
        app.salary || 'N/A',
        app.status,
        app.notes || '',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row =>
          row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');

      fs.writeFileSync(outputPath, csvContent);

      logger.info('Applications exported to CSV', {
        outputPath,
        count: applications.length,
      });
    } catch (error) {
      logger.error('Failed to export applications', { error });
      throw error;
    }
  }

  /**
   * Get application by ID
   */
  getApplicationById(applicationId: string): AppliedJob | null {
    const allApplications = this.getAllApplications();
    return allApplications.find(app => app.id === applicationId) || null;
  }

  /**
   * Search applications
   */
  searchApplications(query: string): AppliedJob[] {
    const allApplications = this.getAllApplications();
    const lowerQuery = query.toLowerCase();

    return allApplications.filter(
      app =>
        app.title.toLowerCase().includes(lowerQuery) ||
        app.company.toLowerCase().includes(lowerQuery) ||
        app.notes?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get applications by status
   */
  getApplicationsByStatus(status: AppliedJob['status']): AppliedJob[] {
    const allApplications = this.getAllApplications();
    return allApplications.filter(app => app.status === status);
  }

  /**
   * Get applications by date range
   */
  getApplicationsByDateRange(startDate: Date, endDate: Date): AppliedJob[] {
    const allApplications = this.getAllApplications();

    return allApplications.filter(app => {
      const appDate = new Date(app.appliedDate);
      return appDate >= startDate && appDate <= endDate;
    });
  }

  /**
   * Delete old applications
   */
  deleteOldApplications(days: number = 90): number {
    try {
      const files = fs.readdirSync(this.appliedDir).filter(f => f.endsWith('.json'));
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      let deletedCount = 0;

      for (const file of files) {
        const filepath = path.join(this.appliedDir, file);
        const stats = fs.statSync(filepath);

        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filepath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        logger.info(`Deleted ${deletedCount} old application files`);
      }

      return deletedCount;
    } catch (error) {
      logger.error('Failed to delete old applications', { error });
      return 0;
    }
  }
}

// Export singleton instance
export const applicationTracker = new ApplicationTracker();
