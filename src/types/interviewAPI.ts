/**
 * Type definitions for ZipRecruiter Interview API
 * Based on API discovery from monitoring session
 */

export type QuestionType = 'textField' | 'select' | 'info';

export type ApplicationStatus = 'SCREENING_QUESTIONS' | 'REVIEW' | 'COMPLETED';

export type QuestionGroupCategory = 'job' | 'compliance';

export interface SelectOption {
  value: string;
  label: string;
}

export interface QuestionDefinition {
  id: string;
  type: QuestionType;
  text?: string;              // For textField and select
  questionHtml?: string;      // For info type (HTML content)
  order: number;
  required?: boolean;
  minLength?: number;         // -1 means no limit
  maxLength?: number;         // -1 means no limit
  options?: SelectOption[];   // Only for select type
}

export interface Question {
  id: string;
  order: number;
  required?: boolean;
  question: QuestionDefinition;
}

export interface QuestionAnswerGroup {
  group: number;
  applicationId: string;
  questions: Question[];
  cargo?: {
    QUESTION_GROUP_CATEGORY: QuestionGroupCategory;
  };
}

export interface InterviewGetResponse {
  totalGroups: number;
  totalQuestions: number;
  group: number;
  status: ApplicationStatus;
  atsName: string;
  applicationId: string;
  questionAnswerGroup: QuestionAnswerGroup;
}

export interface InterviewPostResponse {
  status: ApplicationStatus;
  totalGroups: number;
  totalQuestions: number;
  atsName: string;
  applicationId: string;
  group?: number;                          // Present if more questions
  questionAnswerGroup?: QuestionAnswerGroup; // Present if more questions
}

export interface Answer {
  id: string;
  answer: string[];  // Always an array, even for single values
}

export interface AnswerHolder {
  answers: Answer[];
}

export interface InterviewPostRequest {
  answer_holders: AnswerHolder[];
}

/**
 * Helper type for working with questions
 */
export interface ParsedQuestion {
  id: string;
  type: QuestionType;
  text: string;                // Extracted from question.text or generated from id
  htmlContent?: string;        // For info type
  required: boolean;
  order: number;
  minLength?: number;
  maxLength?: number;
  options?: SelectOption[];
}

/**
 * Application flow state
 */
export interface ApplicationState {
  listingKey: string;
  placementId: string;
  applicationId?: string;
  currentGroup: number;
  totalGroups: number;
  totalQuestions: number;
  status: ApplicationStatus;
  atsName?: string;
}

/**
 * Check if response indicates more questions
 */
export function hasMoreQuestions(response: InterviewPostResponse): boolean {
  return (
    response.status === 'SCREENING_QUESTIONS' &&
    response.questionAnswerGroup !== undefined
  );
}

/**
 * Check if application is complete
 */
export function isApplicationComplete(response: InterviewPostResponse): boolean {
  return (
    response.status === 'REVIEW' &&
    response.questionAnswerGroup === undefined
  );
}

/**
 * Extract questions from response
 */
export function extractQuestions(
  response: InterviewGetResponse | InterviewPostResponse
): Question[] {
  if ('questionAnswerGroup' in response && response.questionAnswerGroup) {
    return response.questionAnswerGroup.questions;
  }
  return [];
}

/**
 * Create answer object
 */
export function createAnswer(id: string, value: string | string[]): Answer {
  return {
    id,
    answer: Array.isArray(value) ? value : [value]
  };
}

/**
 * Create POST request body
 */
export function createPostRequest(answers: Answer[]): InterviewPostRequest {
  return {
    answer_holders: [{ answers }]
  };
}
