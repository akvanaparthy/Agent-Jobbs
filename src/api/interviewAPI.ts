import { Page } from 'playwright';
import {
  InterviewGetResponse,
  InterviewPostResponse,
  InterviewPostRequest,
  Answer,
  createPostRequest,
  hasMoreQuestions,
  isApplicationComplete
} from '../types/interviewAPI';
import { logger } from '../utils/logger';

/**
 * Client for interacting with ZipRecruiter's Interview API
 */
export class InterviewAPIClient {
  private readonly baseUrl = 'https://www.ziprecruiter.com/apply/api/v2/interview';
  private readonly placementId = '44071'; // Constant across all applications
  private readonly maxRetries = 3;
  private readonly retryDelay = 2000; // ms

  constructor(private page: Page) {}

  /**
   * Retry helper for network operations
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry on 404 or other client errors
        if (error.message && error.message.includes('HTTP 4')) {
          throw error;
        }

        if (attempt < this.maxRetries) {
          logger.warn(`${operationName} failed (attempt ${attempt}/${this.maxRetries}), retrying...`, {
            error: error.message
          });
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }

    logger.error(`${operationName} failed after ${this.maxRetries} attempts`);
    throw lastError;
  }

  /**
   * Fetch interview questions for a job
   */
  async getQuestions(listingKey: string): Promise<InterviewGetResponse> {
    const url = `${this.baseUrl}?listing_key=${listingKey}&placement_id=${this.placementId}`;

    logger.info(`Fetching interview questions for ${listingKey}`);

    return this.retryOperation(async () => {
      const response = await this.page.evaluate(async (url) => {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'fetch'
          }
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        return await res.json();
      }, url);

      logger.info(`Received ${response.totalQuestions} questions across ${response.totalGroups} group(s)`);
      return response as InterviewGetResponse;
    }, 'getQuestions');
  }

  /**
   * Submit answers for current group
   */
  async submitAnswers(
    listingKey: string,
    group: number,
    answers: Answer[]
  ): Promise<InterviewPostResponse> {
    const url = `${this.baseUrl}?listing_key=${listingKey}&group=${group}&placement_id=${this.placementId}`;
    const body: InterviewPostRequest = {
      answer_holders: [{ answers }]
    };

    logger.info(`Submitting ${answers.length} answers for group ${group}`);

    return this.retryOperation(async () => {
      const response = await this.page.evaluate(async ({ url, body }) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'fetch'
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        return await res.json();
      }, { url, body });

      logger.info(`Submission response: status=${response.status}`);

      if (hasMoreQuestions(response)) {
        logger.info(`More questions available in group ${response.group}`);
      } else if (isApplicationComplete(response)) {
        logger.info('Application complete!');
      }

      return response as InterviewPostResponse;
    }, 'submitAnswers');
  }

  /**
   * Complete multi-step interview flow
   * Handles GET initial questions, then POST for each group until complete
   */
  async completeInterview(
    listingKey: string,
    answerProvider: (questions: InterviewGetResponse | InterviewPostResponse) => Promise<Answer[]>
  ): Promise<InterviewPostResponse> {
    logger.info(`Starting interview for ${listingKey}`);

    // Step 1: GET initial questions
    let currentResponse: InterviewGetResponse | InterviewPostResponse = await this.getQuestions(listingKey);
    let currentGroup = 1;

    // Step 2: Loop through groups until complete
    let iterationCount = 0;
    const maxIterations = 15;

    while (true) {
      iterationCount++;

      // Safety check: prevent infinite loops
      if (iterationCount > maxIterations) {
        throw new Error(`Exceeded maximum iterations (${maxIterations}), possible infinite loop`);
      }

      // Get answers for current group's questions
      const answers = await answerProvider(currentResponse);

      // Submit answers
      const postResponse = await this.submitAnswers(listingKey, currentGroup, answers);

      // Check if complete
      if (isApplicationComplete(postResponse)) {
        logger.info('Interview completed successfully');
        return postResponse;
      }

      // Check if more questions
      if (hasMoreQuestions(postResponse)) {
        currentResponse = postResponse;
        currentGroup = postResponse.group!;
        logger.info(`Continuing to group ${currentGroup} (iteration ${iterationCount})`);
      } else {
        // Unexpected state
        logger.warn('Unexpected response state', { status: postResponse.status });
        throw new Error('Unexpected interview state: neither complete nor more questions');
      }
    }
  }
}

/**
 * Helper to create interview API client from page
 */
export function createInterviewClient(page: Page): InterviewAPIClient {
  return new InterviewAPIClient(page);
}
