import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { chromaDB } from '../storage/chromaDB';
import { resumeProcessor } from '../storage/resumeProcessor';
import { logger } from '../utils/logger';
import { PATHS } from '../config/constants';

async function processResume(): Promise<void> {
  console.log('\n===========================================');
  console.log('  Resume Processing');
  console.log('===========================================\n');

  try {
    // Initialize ChromaDB
    console.log('Connecting to ChromaDB...');
    await chromaDB.initialize();
    console.log('✓ Connected to ChromaDB\n');

    // Check for resume files
    const resumeDir = path.resolve(process.cwd(), PATHS.RESUME_DIR);

    if (!fs.existsSync(resumeDir)) {
      fs.mkdirSync(resumeDir, { recursive: true });
    }

    const files = fs.readdirSync(resumeDir).filter(f =>
      /\.(pdf|docx|txt)$/i.test(f)
    );

    if (files.length === 0) {
      console.error('❌ No resume files found!');
      console.log(`\nPlease add your resume to: ${resumeDir}`);
      console.log('Supported formats: PDF, DOCX, TXT\n');
      process.exit(1);
    }

    // List available files
    console.log('Available resume files:');
    files.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file}`);
    });

    // Ask user to select file
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let selectedFile: string;

    if (files.length === 1) {
      selectedFile = files[0];
      console.log(`\nUsing: ${selectedFile}`);
    } else {
      const answer = await new Promise<string>((resolve) => {
        rl.question('\nSelect a file (1-' + files.length + '): ', resolve);
      });

      const index = parseInt(answer) - 1;

      if (index < 0 || index >= files.length) {
        console.error('❌ Invalid selection');
        rl.close();
        process.exit(1);
      }

      selectedFile = files[index];
    }

    rl.close();

    // Check if resume already processed
    const stats = await chromaDB.getStats();

    if (stats.resumeChunks > 0) {
      console.log(`\n⚠️  Warning: ${stats.resumeChunks} resume chunks already exist in ChromaDB`);

      const rl2 = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const replace = await new Promise<string>((resolve) => {
        rl2.question('Do you want to replace them? (y/n): ', resolve);
      });

      rl2.close();

      if (replace.toLowerCase() === 'y') {
        console.log('Clearing existing resume chunks...');
        await chromaDB.clearResumeChunks();
        console.log('✓ Cleared\n');
      } else {
        console.log('Keeping existing chunks\n');
      }
    }

    // Process resume
    const filepath = path.join(resumeDir, selectedFile);
    console.log(`\nProcessing resume: ${selectedFile}...`);

    const chunks = await resumeProcessor.processResumeFile(filepath);

    console.log('\n✓ Resume processed successfully!');
    console.log(`\nSummary:`);
    console.log(`  - Total chunks: ${chunks.length}`);

    // Show breakdown by section
    const sectionCounts = chunks.reduce((acc, chunk) => {
      acc[chunk.section] = (acc[chunk.section] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('  - Breakdown:');
    Object.entries(sectionCounts).forEach(([section, count]) => {
      console.log(`      ${section}: ${count}`);
    });

    // Show stats
    const newStats = await chromaDB.getStats();
    console.log(`\n  ChromaDB Status:`);
    console.log(`    Resume chunks: ${newStats.resumeChunks}`);
    console.log(`    Q&A pairs: ${newStats.qaPairs}`);

    console.log('\n===========================================\n');
  } catch (error) {
    console.error('\n❌ Failed to process resume:', error);
    process.exit(1);
  }
}

// Run the script
processResume()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
