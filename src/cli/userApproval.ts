import * as readline from 'readline';
import { logger } from '../utils/logger';
import { ParsedQuestion } from '../types/interviewAPI';

export interface ApprovalResult {
  approved: boolean;
  answer: string;
  edited: boolean;
  regenerate: boolean;
  skip: boolean;
}

/**
 * CLI interface for user approval of AI-generated answers
 */
export class UserApprovalCLI {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Prompt user to approve/edit an answer
   */
  async promptApproval(
    question: ParsedQuestion,
    proposedAnswer: string,
    confidence: number
  ): Promise<ApprovalResult> {
    console.log('\n' + '='.repeat(80));
    console.log('❓ ANSWER APPROVAL NEEDED');
    console.log('='.repeat(80));
    console.log(`\nQuestion: ${question.text}`);
    console.log(`Required: ${question.required ? 'YES' : 'NO'}`);

    if (question.options && question.options.length > 0) {
      console.log('\nAvailable options:');
      question.options.forEach((opt, idx) => {
        console.log(`  ${idx + 1}. ${opt.label}`);
      });
    }

    console.log(`\nProposed answer: "${proposedAnswer}"`);
    console.log(`Confidence: ${(confidence * 100).toFixed(0)}%`);
    console.log('\n' + '-'.repeat(80));
    console.log('Options:');
    console.log('  [a] Approve and use this answer');
    console.log('  [e] Edit the answer');
    console.log('  [r] Regenerate answer (ask AI again)');
    console.log('  [s] Skip this job');
    console.log('-'.repeat(80));

    const choice = await this.prompt('Your choice [a/e/r/s]: ');
    const lowerChoice = choice.toLowerCase().trim();

    if (lowerChoice === 'a') {
      console.log('✓ Answer approved\n');
      return {
        approved: true,
        answer: proposedAnswer,
        edited: false,
        regenerate: false,
        skip: false,
      };
    }

    if (lowerChoice === 'e') {
      const newAnswer = await this.prompt(`Enter your answer: `);
      console.log('✓ Answer updated\n');
      return {
        approved: true,
        answer: newAnswer.trim(),
        edited: true,
        regenerate: false,
        skip: false,
      };
    }

    if (lowerChoice === 'r') {
      console.log('↻ Will regenerate answer\n');
      return {
        approved: false,
        answer: proposedAnswer,
        edited: false,
        regenerate: true,
        skip: false,
      };
    }

    if (lowerChoice === 's') {
      console.log('⊗ Skipping this job\n');
      return {
        approved: false,
        answer: proposedAnswer,
        edited: false,
        regenerate: false,
        skip: true,
      };
    }

    // Invalid choice, default to skip
    console.log('⚠ Invalid choice, skipping job\n');
    return {
      approved: false,
      answer: proposedAnswer,
      edited: false,
      regenerate: false,
      skip: true,
    };
  }

  /**
   * Show progress message
   */
  showProgress(current: number, total: number, jobTitle: string): void {
    console.log(`\n[${'='.repeat(40)}]`);
    console.log(`Processing job ${current}/${total}: ${jobTitle}`);
    console.log(`[${'='.repeat(40)}]\n`);
  }

  /**
   * Show success message
   */
  showSuccess(message: string): void {
    console.log(`\n✓ ${message}\n`);
  }

  /**
   * Show error message
   */
  showError(message: string): void {
    console.log(`\n✗ ${message}\n`);
  }

  /**
   * Show info message
   */
  showInfo(message: string): void {
    console.log(`\nℹ ${message}\n`);
  }

  /**
   * Prompt for yes/no confirmation
   */
  async confirmYesNo(question: string): Promise<boolean> {
    const answer = await this.prompt(`${question} [y/n]: `);
    return answer.toLowerCase().trim() === 'y';
  }

  /**
   * Basic prompt
   */
  private prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  }

  /**
   * Close the readline interface
   */
  close(): void {
    this.rl.close();
  }
}
