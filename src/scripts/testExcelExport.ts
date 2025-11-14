import { exportJobsToExcel } from '../utils/excelExport';
import { JobListing, MatchReport } from '../types';
import * as fs from 'fs';
import * as path from 'path';

async function testExcelExport() {
  console.log('Testing Excel export with mock data...');

  // Load real jobs from the latest extraction
  const jobsDir = path.join(process.cwd(), 'data', 'jobs');
  const files = fs.readdirSync(jobsDir).filter(f => f.endsWith('.json'));
  const latestFile = files.sort().reverse()[0];
  const jobsFilePath = path.join(jobsDir, latestFile);
  
  console.log(`Loading jobs from: ${latestFile}`);
  const jobs: JobListing[] = JSON.parse(fs.readFileSync(jobsFilePath, 'utf-8'));
  
  console.log(`Loaded ${jobs.length} jobs`);

  // Create mock match data for some jobs
  const jobsWithMatches = jobs.map((job, index) => {
    // Only add match data for first 5 jobs
    if (index < 5) {
      const mockMatch: MatchReport = {
        overallScore: 0.75 + (Math.random() * 0.2),
        titleMatch: 0.8 + (Math.random() * 0.15),
        skillsMatch: 0.7 + (Math.random() * 0.2),
        experienceMatch: 0.65 + (Math.random() * 0.25),
        matchedSkills: ['Python', 'TypeScript', 'AI/ML', 'APIs'],
        missingSkills: ['Kubernetes', 'Docker'],
        strengths: [
          'Strong technical background',
          'Relevant experience with AI/ML',
          'Good culture fit'
        ],
        concerns: [
          'Salary range may be lower than expected',
          'Location preference unclear'
        ],
        reasoning: 'Good match based on skills and experience'
      };
      return { job, match: mockMatch };
    }
    // Return jobs without match data
    return { job };
  });

  try {
    const excelPath = await exportJobsToExcel(jobsWithMatches);
    console.log(`✅ Excel export successful: ${excelPath}`);
  } catch (error) {
    console.error('❌ Excel export failed:', error);
    throw error;
  }
}

testExcelExport()
  .then(() => {
    console.log('Test completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
