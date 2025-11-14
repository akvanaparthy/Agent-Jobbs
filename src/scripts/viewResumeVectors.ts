import { chromaDB } from '../storage/chromaDB';
import { logger } from '../utils/logger';

async function viewResumeVectors(): Promise<void> {
  console.log('\n===========================================');
  console.log('  Resume Vectors in ChromaDB');
  console.log('===========================================\n');

  try {
    // Initialize ChromaDB
    console.log('Connecting to ChromaDB...');
    await chromaDB.initialize();
    console.log('✓ Connected to ChromaDB\n');

    // Get stats
    const stats = await chromaDB.getStats();
    console.log(`📊 ChromaDB Status:`);
    console.log(`   Resume chunks: ${stats.resumeChunks}`);
    console.log(`   Q&A pairs: ${stats.qaPairs}\n`);

    if (stats.resumeChunks === 0) {
      console.log('⚠️  No resume chunks found in ChromaDB!');
      console.log('\nRun this command to process your resume:');
      console.log('   npm run resume:process\n');
      process.exit(0);
    }

    // Get all resume chunks (search with empty query returns all)
    console.log('📄 Fetching resume chunks...\n');
    const chunks = await chromaDB.getAllResumeChunks();

    if (chunks.length === 0) {
      console.log('No chunks retrieved\n');
      process.exit(0);
    }

    console.log(`Found ${chunks.length} chunks:\n`);
    console.log('===========================================\n');

    // Display each chunk
    chunks.forEach((chunk, index) => {
      console.log(`\n📌 Chunk ${index + 1}/${chunks.length}`);
      console.log('─'.repeat(50));
      
      if (chunk.metadata) {
        console.log(`📂 Section: ${chunk.metadata.section || 'N/A'}`);
        if (chunk.metadata.company) console.log(`🏢 Company: ${chunk.metadata.company}`);
        if (chunk.metadata.role) console.log(`💼 Role: ${chunk.metadata.role}`);
        if (chunk.metadata.dateRange) console.log(`📅 Date: ${chunk.metadata.dateRange}`);
        if (chunk.metadata.technologies && Array.isArray(chunk.metadata.technologies)) {
          console.log(`🔧 Technologies: ${chunk.metadata.technologies.join(', ')}`);
        } else if (chunk.metadata.technologies) {
          console.log(`🔧 Technologies: ${chunk.metadata.technologies}`);
        }
      }
      
      console.log(`\n📝 Content:\n${chunk.text}\n`);
      console.log(`� Text length: ${chunk.text.length} characters`);
      
      console.log('─'.repeat(50));
    });

    console.log('\n===========================================');
    console.log(`✓ Total chunks displayed: ${chunks.length}`);
    console.log('===========================================\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
viewResumeVectors()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
