import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from './logger';
import { JobListing, MatchReport } from '../types';

export interface JobWithMatch {
  job: JobListing;
  match?: MatchReport;
}

/**
 * Export jobs with match scores to Excel file
 */
export async function exportJobsToExcel(jobsWithMatches: JobWithMatch[]): Promise<string> {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Job Results');

    // Define columns
    worksheet.columns = [
      { header: 'Job Title', key: 'title', width: 30 },
      { header: 'Company', key: 'company', width: 25 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Salary', key: 'salary', width: 20 },
      { header: 'Overall Match %', key: 'overallScore', width: 15 },
      { header: 'Skills Match %', key: 'skillsMatch', width: 15 },
      { header: 'Experience Match %', key: 'experienceMatch', width: 18 },
      { header: 'Description (First 500 chars)', key: 'description', width: 50 },
      { header: 'Strengths', key: 'strengths', width: 40 },
      { header: 'Concerns', key: 'concerns', width: 40 },
      { header: 'Job URL', key: 'url', width: 80 },
      { header: 'Posted Date', key: 'postedDate', width: 20 },
      { header: '1-Click Apply', key: 'hasOneClickApply', width: 15 },
    ];

    // Style header row
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };

    worksheet.getRow(1).font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };

    // Add data rows
    for (const { job, match } of jobsWithMatches) {
      const overallScore = match ? Math.round(match.overallScore * 100) : 'N/A';
      const skillsMatch = match ? Math.round(match.skillsMatch * 100) : 'N/A';
      const experienceMatch = match ? Math.round(match.experienceMatch * 100) : 'N/A';

      const row = worksheet.addRow({
        title: job.title,
        company: job.company,
        location: job.location,
        salary: job.salary || 'Not specified',
        overallScore,
        skillsMatch,
        experienceMatch,
        description: job.description ? job.description.substring(0, 500) : 'No description',
        strengths: match ? match.strengths.join(', ') : 'N/A',
        concerns: match ? match.concerns.join(', ') : 'N/A',
        url: job.url,
        postedDate: job.postedDate,
        hasOneClickApply: job.hasOneClickApply ? 'Yes' : 'No',
      });

      // Color code based on overall match score
      if (match && typeof overallScore === 'number') {
        if (overallScore >= 75) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' }, // Light green
          };
        } else if (overallScore >= 50) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFEB9C' }, // Light yellow
          };
        } else if (overallScore < 30) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC7CE' }, // Light red
          };
        }
      }

      // Make URLs hyperlinks
      const urlCell = row.getCell('url');
      urlCell.value = {
        text: job.url,
        hyperlink: job.url,
      };
      urlCell.font = { color: { argb: 'FF0563C1' }, underline: true };
    }

    // Add summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ];

    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };

    summarySheet.getRow(1).font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };

    const totalJobs = jobsWithMatches.length;
    const matchedJobs = jobsWithMatches.filter(j => j.match && j.match.overallScore > 0.5).length;
    const oneClickApplyJobs = jobsWithMatches.filter(j => j.job.hasOneClickApply).length;
    
    const jobsWithScores = jobsWithMatches.filter(j => j.match);
    const avgScore = jobsWithScores.length > 0
      ? jobsWithScores.reduce((sum, j) => sum + (j.match!.overallScore || 0), 0) / jobsWithScores.length
      : 0;

    summarySheet.addRow({ metric: 'Total Jobs Extracted', value: totalJobs });
    summarySheet.addRow({ metric: 'Jobs with Matches > 50%', value: matchedJobs });
    summarySheet.addRow({ metric: 'Jobs with 1-Click Apply', value: oneClickApplyJobs });
    summarySheet.addRow({ metric: 'Average Match Score', value: jobsWithScores.length > 0 ? `${Math.round(avgScore * 100)}%` : 'N/A' });
    summarySheet.addRow({ metric: 'Extraction Timestamp', value: new Date().toISOString() });

    // Save file
    const fileName = `job-results-${new Date().getTime()}.xlsx`;
    const resultsDir = path.join(process.cwd(), 'data', 'results');
    
    // Ensure results directory exists
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const filePath = path.join(resultsDir, fileName);

    await workbook.xlsx.writeFile(filePath);

    logger.info('Job results exported to Excel', { filePath, totalJobs });
    return filePath;
  } catch (error) {
    logger.error('Failed to export jobs to Excel', { error });
    throw error;
  }
}
