import { Page } from 'playwright';
import {
  JobListing,
  MatchReport,
  AppliedJob,
  ApplicationQuestion
} from '../types';
import {
  InterviewGetResponse,
  InterviewPostResponse,
  ParsedQuestion,
  Answer as APIAnswer,
  createAnswer,
  hasMoreQuestions,
  isApplicationComplete
} from '../types/interviewAPI';
import { InterviewAPIClient } from '../api/interviewAPI';
import { QuestionParser } from '../services/questionParser';
import { QAAgent } from '../agents/qaAgent';
import { ApplicationTracker } from '../storage/applicationTracker';
import { UserApprovalCLI } from '../cli/userApproval';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import * as crypto from 'crypto';

interface ApplicationResult {
  success: boolean;
  applied: boolean;
  jobId: string;
  error?: string;
  appliedJob?: AppliedJob;
}

/**
 * Orchestrates API-based interactive application flow
 */
export class InteractiveApplicationFlow {
  private apiClient: InterviewAPIClient;
  private questionParser: QuestionParser;
  private approvalCLI: UserApprovalCLI;

  constructor(
    private page: Page,
    private qaAgent: QAAgent,
    private applicationTracker: ApplicationTracker
  ) {
    this.apiClient = new InterviewAPIClient(page);
    this.questionParser = new QuestionParser();
    this.approvalCLI = new UserApprovalCLI();
  }

  /**
   * Apply to a job using API-based flow
   */
  async applyToJob(
    job: JobListing,
    matchReport: MatchReport,
    listingKey: string
  ): Promise<ApplicationResult> {
    logger.info(`Starting API-based application for: ${job.title}`);

    try {
      // MUST find and click the apply button - API returns 404 without session initialization
      const applyButton = await this.findApplyButtonForJob(listingKey, job.title);

      if (!applyButton) {
        throw new Error('Apply button not found - cannot proceed without initializing session');
      }

      logger.info('Clicking 1-Click Apply button');
      await applyButton.click();
      await this.page.waitForTimeout(2000);

      // Use completeInterview to handle multi-step flow
      const result = await this.apiClient.completeInterview(
        listingKey,
        async (response) => this.generateAnswers(response, job)
      );

      // Application complete!
      if (isApplicationComplete(result)) {
        logger.info('✓ Application submitted successfully');

        const appliedJob: AppliedJob = {
          id: `applied_${crypto.randomBytes(8).toString('hex')}`,
          job,
          matchReport,
          appliedAt: new Date().toISOString(),
          status: 'submitted',
          autoApplied: true
        };

        await this.applicationTracker.recordApplication(appliedJob);

        return {
          success: true,
          applied: true,
          jobId: job.id,
          appliedJob
        };
      }

      return {
        success: false,
        applied: false,
        jobId: job.id,
        error: 'Application did not complete'
      };

    } catch (error: any) {
      logger.error('Application flow error', { error: error.message });
      return {
        success: false,
        applied: false,
        jobId: job.id,
        error: error.message
      };
    }
  }

  /**
   * Generate answers for current question group
   */
  private async generateAnswers(
    response: InterviewGetResponse | InterviewPostResponse,
    job: JobListing
  ): Promise<APIAnswer[]> {
    const questions = this.questionParser.parseResponse(response);

    logger.info(`Processing ${questions.length} questions`);
    this.questionParser.logQuestions(questions);

    const answers: APIAnswer[] = [];

    for (const question of questions) {
      const answer = await this.answerQuestion(question, job);
      answers.push(answer);
    }

    return answers;
  }

  /**
   * Answer a single question with auto-approve logic
   */
  private async answerQuestion(
    question: ParsedQuestion,
    job: JobListing
  ): Promise<APIAnswer> {
    // Info questions always get empty string
    if (question.type === 'info') {
      logger.debug(`Info question (no input required): ${question.text}`);
      return createAnswer(question.id, '');
    }

    logger.info(`Answering: ${question.text}`);

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        // Get answer from QA agent (checks ChromaDB cache first)
        const qaAnswer = await this.qaAgent.answerQuestion(
          {
            id: question.id,
            type: this.mapQuestionType(question.type),
            label: question.text,
            required: question.required,
            options: question.options?.map(o => o.label)
          },
          job
        );

        // Check confidence for auto-approve
        const confidenceThreshold = config.autoApproveConfidence || 65;
        const confidencePercent = qaAnswer.confidence * 100;

        if (confidencePercent >= confidenceThreshold) {
          logger.info(`✓ Auto-approved (${confidencePercent.toFixed(0)}% confidence): ${qaAnswer.answer}`);
          return createAnswer(question.id, qaAnswer.answer);
        }

        // Low confidence - need user approval
        logger.warn(`⚠ Low confidence (${confidencePercent.toFixed(0)}%), requesting user approval`);

        const approval = await this.approvalCLI.promptApproval(
          question,
          qaAnswer.answer,
          qaAnswer.confidence
        );

        if (approval.skip) {
          throw new Error('User chose to skip this job');
        }

        if (approval.regenerate) {
          logger.info('Regenerating answer...');
          continue; // Retry loop
        }

        if (approval.approved) {
          logger.info(`✓ User approved answer${approval.edited ? ' (edited)' : ''}`);
          return createAnswer(question.id, approval.answer);
        }

      } catch (error: any) {
        if (error.message === 'User chose to skip this job') {
          throw error;
        }

        logger.error(`Error answering question "${question.text}": ${error.message}`);

        // For required questions, throw error
        if (question.required) {
          throw new Error(`Cannot proceed: required question "${question.text}" could not be answered`);
        }

        // For optional questions, return empty
        return createAnswer(question.id, '');
      }
    }

    // Max attempts reached
    logger.error(`Failed to get approved answer after ${maxAttempts} attempts`);
    throw new Error(`Could not get approved answer for: ${question.text}`);
  }

  /**
   * Find 1-Click Apply button for a specific job on search results page
   */
  private async findApplyButtonForJob(listingKey: string, jobTitle: string) {
    logger.debug(`Searching for apply button for job: ${jobTitle}`, { listingKey });

    try {
      // Strategy 1: Find ANY visible "1-Click Apply" button on page (job detail page)
      const allButtons = await this.page.$$('button');
      for (const button of allButtons) {
        const text = await button.textContent().catch(() => '');
        if (text && text.includes('1-Click Apply') && await button.isVisible().catch(() => false)) {
          logger.info('Found 1-Click Apply button on job detail page');
          return button;
        }
      }

      // Strategy 2: Find job card by listing key (search results page)
      const jobCard = await this.page.$(`[data-listing-key="${listingKey}"]`);
      if (jobCard) {
        const button = await jobCard.$('button:has-text("1-Click Apply")');
        if (button) {
          logger.info('Found button via job card data-listing-key');
          return button;
        }
      }

      // Strategy 3: Find job card by title (search results page)
      const jobCards = await this.page.$$('article, .job_result, [role="article"]');
      for (const card of jobCards) {
        const titleText = await card.textContent().catch(() => '');
        if (titleText && titleText.includes(jobTitle.substring(0, 30))) {
          const button = await card.$('button:has-text("1-Click Apply")');
          if (button && await button.isVisible().catch(() => false)) {
            logger.info('Found button via job card title match');
            return button;
          }
        }
      }

      logger.warn('No 1-Click Apply button found on page');
      return null;

    } catch (error) {
      logger.error('Error finding apply button', { error });
      return null;
    }
  }

  /**
   * Map API question type to legacy ApplicationQuestion type
   */
  private mapQuestionType(type: string): 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' {
    switch (type) {
      case 'textField':
        return 'text';
      case 'select':
        return 'select';
      default:
        return 'text';
    }
  }

  /**
   * Cleanup resources (close readline interface)
   */
  cleanup(): void {
    this.approvalCLI.close();
  }
}
