import { ChatAnthropic } from '@langchain/anthropic';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { JobListing, MatchReport } from '../types';
import { chromaDB } from '../storage/chromaDB';

export class CoverLetterAgent {
  private model: ChatAnthropic;

  constructor() {
    this.model = new ChatAnthropic({
      apiKey: config.anthropicApiKey,
      model: config.claudeModel,
      temperature: 0.7, // Slightly higher for creative writing
    });
  }

  /**
   * Generate a tailored cover letter for a job
   */
  async generateCoverLetter(
    job: JobListing,
    matchReport: MatchReport
  ): Promise<string> {
    try {
      logger.info('Generating cover letter', { job: job.title, company: job.company });

      // Get relevant resume context
      const resumeContext = await this.getResumeContext(job);

      // Build prompt
      const prompt = `You are writing a professional cover letter for a job application.

**CRITICAL RULES - DO NOT VIOLATE:**
1. Use ONLY information from the provided resume context
2. Do NOT invent or hallucinate any experiences, projects, or skills
3. Do NOT mention experiences not in the resume
4. If information is not available in resume, omit that section
5. Be specific and reference actual resume details

**Job Information:**
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}

**Job Description:**
${job.description.substring(0, 1000)}...

**Candidate's Resume Context (USE ONLY THIS):**
${resumeContext}

**Match Analysis:**
- Overall Match: ${(matchReport.overallScore * 100).toFixed(0)}%
- Matched Skills: ${matchReport.matchedSkills?.join(', ') || 'N/A'}
- Strengths: ${matchReport.strengths?.join(', ') || 'N/A'}

**Task:**
Write a concise, professional cover letter (250-300 words) that:
1. Opens with enthusiasm for the specific role and company
2. Highlights 2-3 relevant experiences FROM THE RESUME that match job requirements
3. References specific skills from the matched skills list
4. Explains why the candidate is interested in this role
5. Closes professionally

**Format:**
[Your Name]
[Date]

Dear Hiring Manager,

[3-4 paragraphs following the structure above]

Sincerely,
[Your Name]

**Remember:** Use ONLY experiences and details from the resume context provided. Do not fabricate anything.`;

      const response = await (this.model as any).invoke(prompt);
      const coverLetter = response.content.toString().trim();

      logger.info('Cover letter generated successfully', {
        length: coverLetter.length,
        job: job.title,
      });

      return coverLetter;
    } catch (error) {
      logger.error('Failed to generate cover letter', { error });
      throw error;
    }
  }

  /**
   * Get relevant resume context for cover letter
   */
  private async getResumeContext(job: JobListing): Promise<string> {
    try {
      // Search for relevant resume chunks based on job description
      const query = `${job.title} ${job.description.substring(0, 500)}`;
      const chunks = await chromaDB.searchResumeChunks(query, 8);

      if (chunks.length === 0) {
        // Fallback: get all resume chunks
        const allChunks = await chromaDB.getAllResumeChunks();
        return allChunks
          .map((chunk) => `[${chunk.section}] ${chunk.text}`)
          .join('\n\n');
      }

      return chunks
        .map((chunk) => `[${chunk.section}] ${chunk.text}`)
        .join('\n\n');
    } catch (error) {
      logger.error('Failed to get resume context', { error });
      return '';
    }
  }
}

// Export singleton instance
export const coverLetterAgent = new CoverLetterAgent();
