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
import { visionAgent } from '../agentic/visionAgent';
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
   * Apply to a job using API-based flow with vision-based validation
   */
  async applyToJob(
    job: JobListing,
    matchReport: MatchReport,
    listingKey: string
  ): Promise<ApplicationResult> {
    logger.info(`Starting vision-enhanced application for: ${job.title}`);

    try {
      // VISION CHECK: Analyze current page state
      await this.validatePageState('before applying');

      // MUST find and click the apply button - API returns 404 without session initialization
      const applyButton = await this.findApplyButtonForJob(listingKey, job.title);

      if (!applyButton) {
        throw new Error('Apply button not found - cannot proceed without initializing session');
      }

      logger.info('Clicking 1-Click Apply button');
      await applyButton.click();
      await this.page.waitForTimeout(2000);

      // VISION CHECK: Verify modal/form appeared
      await this.validatePageState('after clicking apply');

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
   * Validate page state using vision to detect errors/blockers
   */
  private async validatePageState(context: string): Promise<void> {
    try {
      logger.debug(`🔍 Vision check: ${context}`);

      const screenshot = await this.page.screenshot();
      const analysis = await visionAgent.analyzeScreen(screenshot);

      logger.info(`📊 Page state: ${analysis.uiState}`, {
        pageType: analysis.pageType,
        requiresAction: analysis.requiresAction
      });

      // Check for error states
      if (analysis.uiState === 'error_page') {
        throw new Error(`Error page detected: ${analysis.description}`);
      }

      if (analysis.uiState === 'cloudflare_challenge') {
        logger.warn('⚠️  Cloudflare challenge detected - may need manual intervention');
        // Don't throw - let it continue, challenge might auto-resolve
      }

      if (analysis.uiState === 'login_page') {
        throw new Error('Not logged in - redirected to login page');
      }

      // Log suggested actions for debugging
      if (analysis.suggestedActions && analysis.suggestedActions.length > 0) {
        logger.debug('Suggested actions:', analysis.suggestedActions);
      }

    } catch (error) {
      // Vision validation is informational - don't fail the whole flow
      logger.warn(`Vision validation warning (${context}):`, { error });
    }
  }

  /**
   * Find 1-Click Apply button using vision-based approach with hardcoded fallback
   */
  private async findApplyButtonForJob(listingKey: string, jobTitle: string) {
    logger.info(`🔍 Finding apply button for: ${jobTitle}`);

    try {
      // VISION-BASED APPROACH (Primary)
      logger.info('Attempting vision-based button finding...');

      const screenshot = await this.page.screenshot();
      const element = await visionAgent.findElement(
        screenshot,
        `1-Click Apply button for job titled "${jobTitle.substring(0, 50)}"`
      );

      if (element && element.coordinates) {
        logger.info('✅ Vision found apply button!');

        // Convert percentage coordinates to pixels
        const viewport = this.page.viewportSize();
        if (!viewport) {
          throw new Error('No viewport size available');
        }

        const x = (element.coordinates.x / 100) * viewport.width;
        const y = (element.coordinates.y / 100) * viewport.height;

        // Return a mock element that clicks at coordinates
        return {
          click: async () => {
            logger.info('Clicking via vision coordinates', { x, y });
            await this.page.mouse.click(x, y);
          }
        };
      }

      logger.warn('Vision failed to find button, trying hardcoded selectors...');

    } catch (visionError) {
      logger.warn('Vision-based finding error, falling back to selectors', { error: visionError });
    }

    // FALLBACK: Hardcoded selectors (kept for reliability)
    try {
      // Strategy 1: Find ANY visible "1-Click Apply" button on page (job detail page)
      const allButtons = await this.page.$$('button');
      for (const button of allButtons) {
        const text = await button.textContent().catch(() => '');
        if (text && text.includes('1-Click Apply') && await button.isVisible().catch(() => false)) {
          logger.info('✓ Found button via direct selector (job detail page)');
          return button;
        }
      }

      // Strategy 2: Find job card by listing key (search results page)
      const jobCard = await this.page.$(`[data-listing-key="${listingKey}"]`);
      if (jobCard) {
        const button = await jobCard.$('button:has-text("1-Click Apply")');
        if (button) {
          logger.info('✓ Found button via job card data-listing-key');
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
            logger.info('✓ Found button via job card title match');
            return button;
          }
        }
      }

      logger.error('❌ No 1-Click Apply button found with any method');
      return null;

    } catch (error) {
      logger.error('Error in fallback button finding', { error });
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
