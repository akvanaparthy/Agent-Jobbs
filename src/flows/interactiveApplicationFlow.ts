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
   * Apply to a job using hybrid API/DOM approach with vision-based validation
   */
  async applyToJob(
    job: JobListing,
    matchReport: MatchReport,
    listingKey: string
  ): Promise<ApplicationResult> {
    logger.info(`Starting vision-enhanced application for: ${job.title}`);

    try {
      // VISION CHECK: Analyze current page state
      const initialState = await this.validatePageState('before applying');

      // Handle error states before attempting to apply
      if (initialState.isError && !initialState.canContinue) {
        if (initialState.errorType === 'already_applied') {
          return {
            success: true, // Not an error - just skip
            applied: false,
            jobId: job.id,
            error: 'Already applied to this job'
          };
        }

        if (initialState.errorType === 'login_page') {
          throw new Error('Session lost - not logged in. Please re-authenticate.');
        }

        if (initialState.errorType === 'error_page') {
          throw new Error(`Error page detected - skipping job`);
        }
      }

      // MUST find and click the apply button
      const applyButton = await this.findApplyButtonForJob(listingKey, job.title);

      if (!applyButton) {
        throw new Error('Apply button not found - cannot proceed without initializing session');
      }

      logger.info('Clicking 1-Click Apply button');
      await applyButton.click();
      await this.page.waitForTimeout(3000); // Wait for modal to appear

      // VISION CHECK: Verify modal/form appeared
      const afterClickState = await this.validatePageState('after clicking apply');

      // If we hit an error after clicking, handle it
      if (afterClickState.isError && !afterClickState.canContinue) {
        if (afterClickState.errorType === 'error_page') {
          throw new Error('Error occurred after clicking apply button');
        }
      }

      // Check if DOM modal appeared (primary method now)
      const modal = await this.page.$('[data-zds-component="modal"], [role="dialog"][aria-modal="true"]');

      if (modal) {
        logger.info('✓ DOM form modal detected, using DOM-based form filling');
        return await this.handleDOMFormApplication(modal, job, matchReport, listingKey);
      }

      // Fallback to API approach
      logger.info('No DOM modal detected, trying API-based interview');
      const result = await this.apiClient.completeInterview(
        listingKey,
        async (response) => this.generateAnswers(response, job)
      );

      // If API not available, throw error
      if (!result) {
        throw new Error('Neither DOM form nor API interview available for this job');
      }

      // Application complete!
      if (isApplicationComplete(result)) {
        logger.info('✓ Application submitted successfully via API');

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
  private async validatePageState(context: string): Promise<{
    uiState: string;
    isError: boolean;
    errorType?: 'already_applied' | 'error_page' | 'login_page' | 'cloudflare' | 'unknown';
    canContinue: boolean;
  }> {
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
        logger.warn(`Error page detected: ${analysis.description}`);
        return {
          uiState: analysis.uiState,
          isError: true,
          errorType: 'error_page',
          canContinue: false
        };
      }

      if (analysis.uiState === 'cloudflare_challenge') {
        logger.warn('⚠️  Cloudflare challenge detected - may need manual intervention');
        return {
          uiState: analysis.uiState,
          isError: true,
          errorType: 'cloudflare',
          canContinue: true // Might auto-resolve
        };
      }

      if (analysis.uiState === 'login_page') {
        logger.error('Not logged in - redirected to login page');
        return {
          uiState: analysis.uiState,
          isError: true,
          errorType: 'login_page',
          canContinue: false
        };
      }

      // Check for "already applied" state
      const pageText = await this.page.evaluate(() => document.body.innerText);
      if (pageText.includes('Already applied') || pageText.includes('You have already applied')) {
        logger.info('Job already applied to - skipping');
        return {
          uiState: 'already_applied',
          isError: true,
          errorType: 'already_applied',
          canContinue: false
        };
      }

      // Log suggested actions for debugging
      if (analysis.suggestedActions && analysis.suggestedActions.length > 0) {
        logger.debug('Suggested actions:', analysis.suggestedActions);
      }

      return {
        uiState: analysis.uiState,
        isError: false,
        canContinue: true
      };

    } catch (error: any) {
      // Vision validation failed - assume we can continue
      logger.warn(`Vision validation warning (${context}): ${error.message}`);
      return {
        uiState: 'unknown',
        isError: false,
        canContinue: true
      };
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

    } catch (visionError: any) {
      logger.warn('Vision-based finding error, falling back to selectors', {
        error: visionError instanceof Error ? visionError.message : String(visionError)
      });
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

    } catch (error: any) {
      logger.error('Error in fallback button finding', {
        error: error instanceof Error ? error.message : String(error)
      });
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
   * Handle DOM-based form application (modal with form fields)
   */
  private async handleDOMFormApplication(
    modal: any,
    job: JobListing,
    matchReport: MatchReport,
    listingKey: string
  ): Promise<ApplicationResult> {
    try {
      logger.info('📝 Parsing DOM form fields...');

      // Parse all form fields from the modal
      const formFields = await this.parseFormFields(modal);
      logger.info(`Found ${formFields.length} form fields to fill`);

      if (formFields.length === 0) {
        throw new Error('No form fields found in modal');
      }

      // Fill each field using QA agent
      for (const field of formFields) {
        await this.fillFormField(field, job);
      }

      // Find and click Continue/Submit button
      const submitted = await this.submitForm(modal);

      if (!submitted) {
        throw new Error('Failed to submit form - Continue button not found or not clickable');
      }

      // Wait for submission to process
      await this.page.waitForTimeout(2000);

      // Check if there's another form (multi-step)
      const nextModal = await this.page.$('[data-zds-component="modal"], [role="dialog"][aria-modal="true"]');

      if (nextModal) {
        logger.info('🔄 Multi-step form detected, continuing to next step...');
        // Recursively handle next form
        return await this.handleDOMFormApplication(nextModal, job, matchReport, listingKey);
      }

      // Check for success indicators
      const success = await this.checkApplicationSuccess();

      if (success) {
        logger.info('✓ Application submitted successfully via DOM form');

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
        error: 'Form submitted but success not confirmed'
      };

    } catch (error: any) {
      logger.error('DOM form handling error', { error: error.message });
      return {
        success: false,
        applied: false,
        jobId: job.id,
        error: error.message
      };
    }
  }

  /**
   * Parse form fields from modal
   */
  private async parseFormFields(modal: any): Promise<Array<{
    id: string;
    type: string;
    label: string;
    required: boolean;
    selector: string;
    options?: string[];
  }>> {
    return await this.page.evaluate(() => {
      const fields: Array<{
        id: string;
        type: string;
        label: string;
        required: boolean;
        selector: string;
        options?: string[];
      }> = [];

      // Find all input fields
      const inputs = document.querySelectorAll('input[type="text"], input[type="tel"], input[type="email"], textarea');
      inputs.forEach((input: any) => {
        const id = input.id || input.name || `input_${fields.length}`;
        const label = document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() ||
                     input.placeholder ||
                     input.getAttribute('aria-label') ||
                     'Unknown field';

        fields.push({
          id,
          type: input.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'text',
          label,
          required: input.hasAttribute('required') || input.getAttribute('aria-required') === 'true',
          selector: input.id ? `#${input.id}` : `input[name="${input.name}"]`
        });
      });

      // Find all select/dropdown fields
      const selects = document.querySelectorAll('[role="combobox"], select');
      selects.forEach((select: any) => {
        const id = select.id || select.getAttribute('name') || `select_${fields.length}`;
        const labelId = select.getAttribute('aria-labelledby');
        const label = labelId ?
                     document.getElementById(labelId)?.textContent?.trim() || 'Unknown dropdown' :
                     document.querySelector(`label[for="${select.id}"]`)?.textContent?.trim() || 'Unknown dropdown';

        // Get options if available
        const options: string[] = [];
        const optionElements = select.querySelectorAll('[role="option"], option');
        optionElements.forEach((opt: any) => {
          const text = opt.textContent?.trim();
          if (text) options.push(text);
        });

        fields.push({
          id,
          type: 'select',
          label,
          required: select.hasAttribute('required') || select.getAttribute('aria-required') === 'true',
          selector: select.id ? `#${select.id}` : `[role="combobox"][name="${select.getAttribute('name')}"]`,
          options: options.length > 0 ? options : undefined
        });
      });

      return fields;
    });
  }

  /**
   * Fill a single form field using QA agent
   */
  private async fillFormField(
    field: { id: string; type: string; label: string; required: boolean; selector: string; options?: string[] },
    job: JobListing
  ): Promise<void> {
    logger.info(`Filling field: ${field.label}`);

    try {
      // Get answer from QA agent
      const qaAnswer = await this.qaAgent.answerQuestion(
        {
          id: field.id,
          type: field.type === 'select' ? 'select' : field.type === 'textarea' ? 'textarea' : 'text',
          label: field.label,
          required: field.required,
          options: field.options
        },
        job
      );

      // Check confidence
      const confidenceThreshold = config.autoApproveConfidence || 65;
      const confidencePercent = qaAnswer.confidence * 100;

      let finalAnswer = qaAnswer.answer;

      if (confidencePercent >= confidenceThreshold) {
        logger.info(`✓ Auto-approved (${confidencePercent.toFixed(0)}% confidence): ${qaAnswer.answer}`);
      } else {
        // Low confidence - ask user
        logger.warn(`⚠ Low confidence (${confidencePercent.toFixed(0)}%), requesting user approval`);

        const approval = await this.approvalCLI.promptApproval(
          { id: field.id, text: field.label, type: field.type as any, required: field.required, order: 0, options: field.options?.map(o => ({ label: o, value: o })) },
          qaAnswer.answer,
          qaAnswer.confidence
        );

        if (approval.skip) {
          throw new Error('User chose to skip this job');
        }

        finalAnswer = approval.answer;
      }

      // Fill the field
      if (field.type === 'select') {
        await this.fillSelectField(field.selector, finalAnswer);
      } else {
        await this.fillTextField(field.selector, finalAnswer);
      }

      await this.page.waitForTimeout(500); // Small delay between fields

    } catch (error: any) {
      if (error.message === 'User chose to skip this job') {
        throw error;
      }

      logger.error(`Error filling field "${field.label}": ${error.message}`);

      // For required fields, throw error
      if (field.required) {
        throw new Error(`Cannot proceed: required field "${field.label}" could not be filled`);
      }

      logger.warn(`Skipping optional field "${field.label}"`);
    }
  }

  /**
   * Fill a text input field
   */
  private async fillTextField(selector: string, value: string): Promise<void> {
    const input = await this.page.$(selector);
    if (!input) {
      throw new Error(`Field not found: ${selector}`);
    }

    await input.click();
    await input.fill(''); // Clear first
    await input.fill(value);
  }

  /**
   * Fill a select/dropdown field
   */
  private async fillSelectField(selector: string, value: string): Promise<void> {
    const select = await this.page.$(selector);
    if (!select) {
      throw new Error(`Select field not found: ${selector}`);
    }

    // For custom dropdowns (role="combobox")
    const role = await select.getAttribute('role');
    if (role === 'combobox') {
      // Click to open dropdown
      await select.click();
      await this.page.waitForTimeout(500);

      // Find and click the option
      const optionSelector = `[role="option"]:has-text("${value}")`;
      const option = await this.page.$(optionSelector);

      if (option) {
        await option.click();
      } else {
        logger.warn(`Option "${value}" not found in dropdown, using first available option`);
        const firstOption = await this.page.$('[role="option"]');
        if (firstOption) await firstOption.click();
      }
    } else {
      // Standard select element
      await select.selectOption({ label: value });
    }
  }

  /**
   * Submit the form
   */
  private async submitForm(modal: any): Promise<boolean> {
    try {
      // Look for Continue/Submit button
      const submitButton = await modal.$('button[type="submit"], button:has-text("Continue"), button:has-text("Submit")');

      if (!submitButton) {
        logger.error('Submit button not found');
        return false;
      }

      const buttonText = await submitButton.textContent();
      logger.info(`Clicking "${buttonText?.trim()}" button`);

      await submitButton.click();
      return true;
    } catch (error: any) {
      logger.error(`Error submitting form: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if application was successful
   */
  private async checkApplicationSuccess(): Promise<boolean> {
    // Wait a moment for success message to appear
    await this.page.waitForTimeout(2000);

    // Check for success indicators
    const successIndicators = await this.page.evaluate(() => {
      const text = document.body.innerText;
      return (
        text.includes('Application submitted') ||
        text.includes('Successfully applied') ||
        text.includes('Thank you for applying') ||
        text.includes('Application received') ||
        document.querySelector('[data-testid="success-message"]') !== null
      );
    });

    return successIndicators;
  }

  /**
   * Cleanup resources (close readline interface)
   */
  cleanup(): void {
    this.approvalCLI.close();
  }
}
