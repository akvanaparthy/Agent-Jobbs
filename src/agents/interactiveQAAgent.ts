import { Page } from 'playwright';
import { ApplicationQuestion, Answer, JobListing } from '../types';
import { QAAgent } from './qaAgent';
import { FormFiller } from '../automation/formFiller';
import { InteractivePrompts } from '../cli/interactivePrompts';
import { logger } from '../utils/logger';
import { chromaDB } from '../storage/chromaDB';
import * as crypto from 'crypto';

export interface QuestionAnswerPair {
  question: ApplicationQuestion;
  answer: Answer;
  userApproved: boolean;
  edited: boolean;
}

export class InteractiveQAAgent {
  private qaAgent: QAAgent;
  private formFiller: FormFiller;
  private prompts: InteractivePrompts;

  constructor(page: Page, qaAgent: QAAgent) {
    this.qaAgent = qaAgent;
    this.formFiller = new FormFiller(page);
    this.prompts = new InteractivePrompts();
  }

  /**
   * Process all questions interactively
   * For each question:
   * 1. Generate answer (check cache or ask Claude)
   * 2. Show to user for approval
   * 3. Fill field immediately upon approval
   */
  async processQuestionsInteractively(
    questions: ApplicationQuestion[],
    job: JobListing
  ): Promise<{
    completed: boolean;
    questionAnswerPairs: QuestionAnswerPair[];
    skipped: boolean;
  }> {
    logger.info(`Processing ${questions.length} questions interactively`);

    const questionAnswerPairs: QuestionAnswerPair[] = [];
    let questionNumber = 1;

    for (const question of questions) {
      // Process this question
      const result = await this.processQuestion(
        question,
        job,
        questionNumber,
        questions.length
      );

      if (result.skipped) {
        logger.info('User chose to skip this job');
        return {
          completed: false,
          questionAnswerPairs,
          skipped: true
        };
      }

      if (!result.success) {
        logger.warn(`Failed to process question: ${question.label}`);
        this.prompts.showWarning(`Skipping question due to error: ${question.label}`);
        continue;
      }

      // Add to pairs
      questionAnswerPairs.push({
        question,
        answer: result.answer!,
        userApproved: true,
        edited: result.edited
      });

      questionNumber++;
    }

    logger.info(`Completed processing ${questionAnswerPairs.length} questions`);

    return {
      completed: true,
      questionAnswerPairs,
      skipped: false
    };
  }

  /**
   * Process a single question with user interaction and immediate field fill
   */
  private async processQuestion(
    question: ApplicationQuestion,
    job: JobListing,
    questionNumber: number,
    totalQuestions: number
  ): Promise<{
    success: boolean;
    answer?: Answer;
    skipped: boolean;
    edited: boolean;
  }> {
    try {
      // Generate initial answer
      let answer = await this.generateAnswer(question, job);

      let approved = false;
      let edited = false;

      // Loop until user approves or skips
      while (!approved) {
        // Show question and get user choice
        const userChoice = await this.prompts.promptForAnswer(
          question,
          answer,
          questionNumber,
          totalQuestions,
          job.title
        );

        switch (userChoice.action) {
          case 'accept':
            approved = true;
            break;

          case 'edit':
            // User provided custom answer
            answer = {
              ...answer,
              answer: userChoice.editedAnswer!,
              source: 'user_input',
              confidence: 1.0
            };
            approved = true;
            edited = true;
            break;

          case 'regenerate':
            // Regenerate with custom prompt
            this.prompts.showInfo('Regenerating answer...');
            answer = await this.regenerateAnswer(
              question,
              job,
              userChoice.customPrompt!
            );
            // Loop continues to show new answer
            break;

          case 'skip':
            return {
              success: false,
              skipped: true,
              edited: false
            };
        }
      }

      // Answer approved, now fill the field immediately
      this.prompts.showFillingProgress(question.label);

      const fillResult = await this.formFiller.fillField(question, answer);

      if (fillResult.success) {
        this.prompts.showFillingSuccess(question.label);

        // Save to ChromaDB for future use
        if (edited || answer.source === 'generated') {
          await this.saveQuestionAnswerPair(question, answer);
        }

        return {
          success: true,
          answer,
          skipped: false,
          edited
        };
      } else {
        this.prompts.showFillingError(question.label, fillResult.error || 'Unknown error');
        return {
          success: false,
          skipped: false,
          edited
        };
      }
    } catch (error) {
      logger.error(`Error processing question: ${question.label}`, { error });
      return {
        success: false,
        skipped: false,
        edited: false
      };
    }
  }

  /**
   * Generate answer for a question
   */
  private async generateAnswer(
    question: ApplicationQuestion,
    job: JobListing
  ): Promise<Answer> {
    try {
      // Use existing QA Agent to answer
      const answers = await this.qaAgent.answerQuestions([question], job);

      if (answers.length > 0) {
        return answers[0];
      }

      // Fallback if no answer generated
      return {
        questionId: question.id,
        answer: '',
        source: 'generated',
        confidence: 0.0
      };
    } catch (error) {
      logger.error('Failed to generate answer', { error });

      return {
        questionId: question.id,
        answer: '',
        source: 'generated',
        confidence: 0.0
      };
    }
  }

  /**
   * Regenerate answer with custom prompt
   */
  private async regenerateAnswer(
    question: ApplicationQuestion,
    job: JobListing,
    customPrompt: string
  ): Promise<Answer> {
    try {
      // Add custom prompt to question context
      const enhancedQuestion = {
        ...question,
        label: `${question.label}\n\nAdditional context: ${customPrompt}`
      };

      const answers = await this.qaAgent.answerQuestions([enhancedQuestion], job);

      if (answers.length > 0) {
        return answers[0];
      }

      return {
        questionId: question.id,
        answer: '',
        source: 'generated',
        confidence: 0.0
      };
    } catch (error) {
      logger.error('Failed to regenerate answer', { error });

      return {
        questionId: question.id,
        answer: '',
        source: 'generated',
        confidence: 0.0
      };
    }
  }

  /**
   * Save question-answer pair to ChromaDB
   */
  private async saveQuestionAnswerPair(
    question: ApplicationQuestion,
    answer: Answer
  ): Promise<void> {
    try {
      // Save to ChromaDB for future use
      const qaPair = {
        id: crypto.randomBytes(16).toString('hex'),
        question: question.label,
        answer: answer.answer,
        category: 'application',
        keywords: [],
        usageCount: 1,
        lastUsed: new Date().toISOString(),
      };

      await chromaDB.addQAPair(qaPair);
      logger.debug(`Saved Q&A pair: ${question.label}`);
    } catch (error) {
      logger.warn('Failed to save Q&A pair', { error });
    }
  }

  /**
   * Get the InteractivePrompts instance for use in workflow
   */
  getPrompts(): InteractivePrompts {
    return this.prompts;
  }
}
