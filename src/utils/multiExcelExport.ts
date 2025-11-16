import ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from './logger';
import { AppliedJob, JobListing, MatchReport } from '../types';

const RESULTS_DIR = path.join(process.cwd(), 'data', 'results');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

/**
 * Export applied jobs to Excel
 */
export async function exportAppliedJobs(
  appliedJobs: AppliedJob[]
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Applied Jobs');

  // Define columns
  worksheet.columns = [
    { header: 'Job Title', key: 'title', width: 30 },
    { header: 'Company', key: 'company', width: 25 },
    { header: 'Location', key: 'location', width: 20 },
    { header: 'Job URL', key: 'url', width: 50 },
    { header: 'Match Score', key: 'matchScore', width: 12 },
    { header: 'Applied Date', key: 'appliedDate', width: 20 },
    { header: 'Applied Time', key: 'appliedTime', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Auto Applied', key: 'autoApplied', width: 12 },
    { header: 'Questions Count', key: 'questionsCount', width: 15 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // Add data rows
  appliedJobs.forEach((app) => {
    const appliedDate = new Date(app.appliedAt);
    const jobTitle = app.job?.title || app.title || 'Unknown';
    const jobCompany = app.job?.company || app.company || 'Unknown';
    const jobUrl = app.job?.url || app.url || '';
    const matchScore = app.matchReport?.overallScore || app.matchScore || 0;

    worksheet.addRow({
      title: jobTitle,
      company: jobCompany,
      location: app.job?.location || 'Unknown',
      url: jobUrl,
      matchScore: `${(matchScore * 100).toFixed(0)}%`,
      appliedDate: appliedDate.toLocaleDateString(),
      appliedTime: appliedDate.toLocaleTimeString(),
      status: app.status,
      autoApplied: app.autoApplied ? 'YES' : 'NO',
      questionsCount: app.questionAnswerPairs?.length || 0,
    });
  });

  // Save file
  const filename = `applied-jobs-${Date.now()}.xlsx`;
  const filepath = path.join(RESULTS_DIR, filename);
  await workbook.xlsx.writeFile(filepath);

  logger.info(`Applied jobs exported to: ${filepath}`);
  return filepath;
}

/**
 * Export failed applications to Excel
 */
export async function exportFailedJobs(
  failedJobs: Array<{ job: JobListing; match: any; error: string }>
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Failed Applications');

  // Define columns
  worksheet.columns = [
    { header: 'Job Title', key: 'title', width: 30 },
    { header: 'Company', key: 'company', width: 25 },
    { header: 'Location', key: 'location', width: 20 },
    { header: 'Job URL', key: 'url', width: 50 },
    { header: 'Match Score', key: 'matchScore', width: 12 },
    { header: 'Error Message', key: 'error', width: 40 },
    { header: 'Timestamp', key: 'timestamp', width: 20 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE74C3C' }, // Red color for failed
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // Add data rows
  failedJobs.forEach((failed) => {
    const matchScore = failed.match?.overallScore || 0;

    worksheet.addRow({
      title: failed.job.title,
      company: failed.job.company,
      location: failed.job.location,
      url: failed.job.url,
      matchScore: `${(matchScore * 100).toFixed(0)}%`,
      error: failed.error,
      timestamp: new Date().toLocaleString(),
    });
  });

  // Save file
  const filename = `failed-applications-${Date.now()}.xlsx`;
  const filepath = path.join(RESULTS_DIR, filename);
  await workbook.xlsx.writeFile(filepath);

  logger.info(`Failed jobs exported to: ${filepath}`);
  return filepath;
}

/**
 * Export manual apply jobs with cover letters to Excel
 */
export async function exportManualJobs(
  manualJobs: Array<{
    job: JobListing;
    match: MatchReport;
    coverLetter: string;
    reason: string;
  }>
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Manual Apply Jobs');

  // Define columns
  worksheet.columns = [
    { header: 'Job Title', key: 'title', width: 30 },
    { header: 'Company', key: 'company', width: 25 },
    { header: 'Location', key: 'location', width: 20 },
    { header: 'Job URL', key: 'url', width: 50 },
    { header: 'Match Score', key: 'matchScore', width: 12 },
    { header: 'Reason for Manual', key: 'reason', width: 30 },
    { header: 'Cover Letter', key: 'coverLetter', width: 60 },
    { header: 'Strengths', key: 'strengths', width: 40 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF39C12' }, // Orange color for manual
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // Add data rows
  manualJobs.forEach((manual) => {
    const row = worksheet.addRow({
      title: manual.job.title,
      company: manual.job.company,
      location: manual.job.location,
      url: manual.job.url,
      matchScore: `${(manual.match.overallScore * 100).toFixed(0)}%`,
      reason: manual.reason,
      coverLetter: manual.coverLetter,
      strengths: manual.match.strengths?.join(', ') || '',
    });

    // Wrap text in cover letter cell
    row.getCell('coverLetter').alignment = { wrapText: true, vertical: 'top' };
  });

  // Save file
  const filename = `manual-apply-jobs-${Date.now()}.xlsx`;
  const filepath = path.join(RESULTS_DIR, filename);
  await workbook.xlsx.writeFile(filepath);

  logger.info(`Manual jobs exported to: ${filepath}`);
  return filepath;
}
