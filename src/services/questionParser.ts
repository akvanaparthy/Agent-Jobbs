import type {
  InterviewGetResponse,
  InterviewPostResponse,
  Question,
  QuestionDefinition,
  ParsedQuestion,
  extractQuestions
} from '../types/interviewAPI';
import { logger } from '../utils/logger';

/**
 * Parses and normalizes questions from ZipRecruiter Interview API responses
 */
export class QuestionParser {
  /**
   * Parse questions from API response
   */
  parseResponse(
    response: InterviewGetResponse | InterviewPostResponse
  ): ParsedQuestion[] {
    const questions = this.extractQuestionsFromResponse(response);
    return questions.map(q => this.normalizeQuestion(q));
  }

  /**
   * Extract questions array from response
   */
  private extractQuestionsFromResponse(
    response: InterviewGetResponse | InterviewPostResponse
  ): Question[] {
    if ('questionAnswerGroup' in response && response.questionAnswerGroup) {
      return response.questionAnswerGroup.questions || [];
    }
    return [];
  }

  /**
   * Normalize a single question to ParsedQuestion format
   */
  private normalizeQuestion(question: Question): ParsedQuestion {
    const def = question.question;

    return {
      id: def.id,
      type: def.type,
      text: this.extractQuestionText(def),
      htmlContent: def.questionHtml,
      required: question.required || def.required || false,
      order: question.order || def.order,
      minLength: def.minLength,
      maxLength: def.maxLength,
      options: def.options
    };
  }

  /**
   * Extract human-readable question text
   */
  private extractQuestionText(def: QuestionDefinition): string {
    // For textField and select, use text field
    if (def.text) {
      return def.text;
    }

    // For info type, extract from HTML if available
    if (def.type === 'info' && def.questionHtml) {
      return this.extractTextFromHtml(def.questionHtml);
    }

    // Fallback: Generate from ID
    return this.generateTextFromId(def.id);
  }

  /**
   * Extract plain text from HTML string
   */
  private extractTextFromHtml(html: string): string {
    // Remove HTML tags
    const text = html.replace(/<[^>]*>/g, ' ').trim();
    // Collapse multiple spaces
    return text.replace(/\s+/g, ' ');
  }

  /**
   * Generate human-readable text from question ID
   */
  private generateTextFromId(id: string): string {
    // Convert snake_case or camelCase to Title Case
    return id
      .replace(/[_-]/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
  }

  /**
   * Filter out info-only questions (display only, no user input)
   */
  filterInputQuestions(questions: ParsedQuestion[]): ParsedQuestion[] {
    return questions.filter(q => q.type !== 'info');
  }

  /**
   * Get all questions including info type (for complete POST request)
   */
  getAllQuestions(questions: ParsedQuestion[]): ParsedQuestion[] {
    return questions;
  }

  /**
   * Group questions by category if cargo metadata available
   */
  categorizeQuestions(
    response: InterviewGetResponse | InterviewPostResponse
  ): { category: string; questions: ParsedQuestion[] } {
    const cargo = 'questionAnswerGroup' in response && response.questionAnswerGroup
      ? response.questionAnswerGroup.cargo
      : undefined;

    const category = cargo?.QUESTION_GROUP_CATEGORY || 'job';
    const questions = this.parseResponse(response);

    return { category, questions };
  }

  /**
   * Log parsed questions for debugging
   */
  logQuestions(questions: ParsedQuestion[]): void {
    logger.info(`Parsed ${questions.length} questions:`);
    questions.forEach((q, idx) => {
      logger.debug(`  ${idx + 1}. [${q.type}] ${q.text}`, {
        id: q.id,
        required: q.required,
        hasOptions: !!q.options
      });
    });
  }
}

export const questionParser = new QuestionParser();
