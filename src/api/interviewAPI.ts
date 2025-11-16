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

  constructor(private page: Page) {}

  /**
   * Fetch interview questions for a job
   */
  async getQuestions(listingKey: string): Promise<InterviewGetResponse> {
    const url = `${this.baseUrl}?listing_key=${listingKey}&placement_id=${this.placementId}`;

    logger.info(`Fetching interview questions for ${listingKey}`);

    try {
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
    } catch (error: any) {
      logger.error(`Failed to fetch questions: ${error.message}`);
      throw error;
    }
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

    try {
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
    } catch (error: any) {
      logger.error(`Failed to submit answers: ${error.message}`);
      throw error;
    }
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
    while (true) {
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
        logger.info(`Continuing to group ${currentGroup}`);
      } else {
        // Unexpected state
        logger.warn('Unexpected response state', { status: postResponse.status });
        throw new Error('Unexpected interview state: neither complete nor more questions');
      }

      // Safety check: prevent infinite loops
      if (currentGroup > 10) {
        throw new Error('Too many question groups (>10), possible infinite loop');
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
