import { ChatAnthropic } from '@langchain/anthropic';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { JobListing, MatchReport, ResumeChunk } from '../types';
import { chromaDB } from '../storage/chromaDB';

export class MatcherAgent {
  private model: ChatAnthropic;

  constructor() {
    this.model = new ChatAnthropic({
      apiKey: config.anthropicApiKey,
      model: config.claudeModel,
      temperature: 0.3, // Lower temperature for more consistent matching
    });
  }

  /**
   * Match job title with candidate profile
   */
  async matchTitle(jobTitle: string): Promise<{ score: number; reasoning: string }> {
    try {
      logger.info('🤖 Analyzing job title match...', { jobTitle });

      // Get resume chunks for context
      const resumeChunks = await chromaDB.searchResumeChunks(jobTitle, 3);

      if (resumeChunks.length === 0) {
        logger.warn('No resume chunks found for title matching');
        return { score: 0, reasoning: 'No resume data available' };
      }

      // Build context from resume
      const resumeContext = resumeChunks
        .map(chunk => `[${chunk.section}] ${chunk.text}`)
        .join('\n\n');

      const prompt = `You are an expert job matching system. Your task is to evaluate how well a job title matches a candidate's profile based on their resume.

Job Title: "${jobTitle}"

Candidate Resume Excerpt:
${resumeContext}

Please analyze the match and respond with a JSON object in this exact format:
{
  "score": <number between 0.0 and 1.0>,
  "reasoning": "<brief explanation>"
}

Scoring guide:
- 1.0: Perfect match, the job title directly matches the candidate's current or recent role and skills
- 0.8-0.9: Strong match, job title aligns well with candidate's experience
- 0.6-0.7: Good match, job title is related to candidate's skillset
- 0.4-0.5: Weak match, some overlap but not ideal
- 0.0-0.3: Poor match, job title doesn't align with candidate's experience

Return ONLY the JSON object, no other text.`;

      logger.info('📡 Calling Claude AI for title analysis...');
      const response = await (this.model as any).invoke(prompt);
      const content = response.content.toString();
      logger.info('✅ Title analysis complete');

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse JSON response');
      }

      const result = JSON.parse(jsonMatch[0]);

      logger.debug('Title match result', { score: result.score, reasoning: result.reasoning });

      return {
        score: Math.max(0, Math.min(1, result.score)), // Clamp to 0-1
        reasoning: result.reasoning,
      };
    } catch (error) {
      logger.error('Title matching failed', { error });
      return { score: 0, reasoning: 'Error during matching' };
    }
  }

  /**
   * Perform full job description analysis
   */
  async matchDescription(job: JobListing): Promise<MatchReport> {
    try {
      logger.info('🔍 Analyzing full job description...', { jobId: job.id, title: job.title });

      // Get relevant resume chunks based on job description
      const resumeChunks = await chromaDB.searchResumeChunks(
        job.description.substring(0, 500), // Use first 500 chars for search
        10 // Get more chunks for comprehensive analysis
      );

      if (resumeChunks.length === 0) {
        return this.createEmptyMatchReport('No resume data available');
      }

      // Build comprehensive resume context
      const resumeContext = this.buildResumeContext(resumeChunks);

      const prompt = `You are an expert job matching analyst. Analyze how well this job matches the candidate's profile.

CANDIDATE EXPERIENCE LEVEL: ${config.candidateExperienceYears} years
The candidate is willing to apply to jobs that require slightly more experience if the role is a good match.

JOB INFORMATION:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
${job.salary ? `Salary: ${job.salary}` : ''}

Job Description:
${job.description}

CANDIDATE RESUME:
${resumeContext}

Please provide a comprehensive analysis in JSON format:
{
  "overallScore": <number 0.0-1.0>,
  "titleMatch": <number 0.0-1.0>,
  "skillsMatch": <number 0.0-1.0>,
  "experienceMatch": <number 0.0-1.0>,
  "reasoning": "<detailed explanation of the match>",
  "matchedSkills": ["skill1", "skill2", ...],
  "missingSkills": ["skill1", "skill2", ...],
  "strengths": ["strength1", "strength2", ...],
  "concerns": ["concern1", "concern2", ...]
}

Scoring criteria:
- overallScore: Holistic assessment of fit (0.0 = no match, 1.0 = perfect match)
- titleMatch: How well job title aligns with candidate's roles
- skillsMatch: Technical skills overlap
- experienceMatch: Evaluate if the job's experience requirements (if stated) align with ${config.candidateExperienceYears} years. 
  * If job requires 0-3 years and candidate has 1-3 years: score 0.9-1.0
  * If job requires 3-5 years and candidate has 1-3 years: score 0.7-0.8 (acceptable stretch)
  * If job requires 5+ years and candidate has 1-3 years: score 0.3-0.5 (significant gap)
  * If experience not clearly stated: score based on job level indicators (junior/mid/senior keywords)

Be thorough but concise. Return ONLY the JSON object.`;

      logger.info('📡 Calling Claude AI for detailed analysis (this may take 10-20 seconds)...');
      const response = await (this.model as any).invoke(prompt);
      const content = response.content.toString();
      logger.info('✅ Detailed analysis complete');

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse JSON response');
      }

      const result = JSON.parse(jsonMatch[0]);

      // Validate and clamp scores
      const matchReport: MatchReport = {
        overallScore: this.clampScore(result.overallScore),
        titleMatch: this.clampScore(result.titleMatch),
        skillsMatch: this.clampScore(result.skillsMatch),
        experienceMatch: this.clampScore(result.experienceMatch),
        reasoning: result.reasoning || '',
        matchedSkills: Array.isArray(result.matchedSkills) ? result.matchedSkills : [],
        missingSkills: Array.isArray(result.missingSkills) ? result.missingSkills : [],
        strengths: Array.isArray(result.strengths) ? result.strengths : [],
        concerns: Array.isArray(result.concerns) ? result.concerns : [],
      };

      logger.info('Job analysis complete', {
        jobId: job.id,
        overallScore: matchReport.overallScore,
      });

      return matchReport;
    } catch (error) {
      logger.error('Job description matching failed', { error });
      return this.createEmptyMatchReport('Error during analysis');
    }
  }

  /**
   * Build resume context from chunks
   */
  private buildResumeContext(chunks: ResumeChunk[]): string {
    const sections: Record<string, string[]> = {
      summary: [],
      experience: [],
      skills: [],
      education: [],
      projects: [],
    };

    // Group chunks by section
    chunks.forEach(chunk => {
      sections[chunk.section].push(chunk.text);
    });

    // Build formatted context
    const context: string[] = [];

    if (sections.summary.length > 0) {
      context.push('=== SUMMARY ===\n' + sections.summary.join('\n\n'));
    }

    if (sections.experience.length > 0) {
      context.push('=== WORK EXPERIENCE ===\n' + sections.experience.join('\n\n'));
    }

    if (sections.skills.length > 0) {
      context.push('=== SKILLS ===\n' + sections.skills.join('\n\n'));
    }

    if (sections.education.length > 0) {
      context.push('=== EDUCATION ===\n' + sections.education.join('\n\n'));
    }

    if (sections.projects.length > 0) {
      context.push('=== PROJECTS ===\n' + sections.projects.join('\n\n'));
    }

    return context.join('\n\n');
  }

  /**
   * Clamp score to valid range
   */
  private clampScore(score: any): number {
    const num = typeof score === 'number' ? score : parseFloat(score) || 0;
    return Math.max(0, Math.min(1, num));
  }

  /**
   * Create empty match report (for errors or no data)
   */
  private createEmptyMatchReport(reason: string): MatchReport {
    return {
      overallScore: 0,
      titleMatch: 0,
      skillsMatch: 0,
      experienceMatch: 0,
      reasoning: reason,
      matchedSkills: [],
      missingSkills: [],
      strengths: [],
      concerns: [reason],
    };
  }

  /**
   * Quick check if job title passes threshold
   */
  async quickTitleCheck(jobTitle: string): Promise<boolean> {
    const result = await this.matchTitle(jobTitle);
    return result.score >= config.titleMatchThreshold;
  }

  /**
   * Check if job passes overall threshold
   */
  checkPassesThreshold(matchReport: MatchReport): boolean {
    return matchReport.overallScore >= config.descriptionMatchThreshold;
  }
}

// Export singleton instance
export const matcherAgent = new MatcherAgent();
