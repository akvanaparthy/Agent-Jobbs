/**
 * Human Input Module - Enables asking user for input when agent is uncertain
 */

import * as readline from 'readline';
import { logger } from '../utils/logger';

class HumanInputManager {
  private rl: readline.Interface | null = null;

  /**
   * Initialize readline interface
   */
  private initReadline(): readline.Interface {
    if (!this.rl) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    }
    return this.rl;
  }

  /**
   * Ask human a question and wait for response
   */
  async askHuman(question: string, options?: {
    defaultValue?: string;
    validate?: (answer: string) => boolean | string;
    hideInput?: boolean;
  }): Promise<string> {
    const rl = this.initReadline();

    return new Promise((resolve) => {
      // Format question
      const prompt = options?.defaultValue
        ? `\n🤔 ${question} [${options.defaultValue}]: `
        : `\n🤔 ${question}: `;

      console.log('\n' + '='.repeat(60));
      console.log('🆘 AGENT NEEDS YOUR INPUT');
      console.log('='.repeat(60));

      // Hide input for sensitive data
      if (options?.hideInput) {
        const stdin = process.stdin;
        stdin.setRawMode?.(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        let input = '';
        console.log(prompt);

        const onData = (char: string) => {
          if (char === '\n' || char === '\r' || char === '\u0004') {
            // Enter or Ctrl+D
            stdin.setRawMode?.(false);
            stdin.pause();
            stdin.removeListener('data', onData);
            console.log(); // New line after hidden input

            const finalAnswer = input || options?.defaultValue || '';

            // Validate if validator provided
            if (options?.validate) {
              const validation = options.validate(finalAnswer);
              if (validation !== true) {
                console.log(`\n❌ Invalid: ${typeof validation === 'string' ? validation : 'Please try again'}`);
                this.askHuman(question, options).then(resolve);
                return;
              }
            }

            logger.info('Human input received (hidden)');
            console.log('='.repeat(60) + '\n');
            resolve(finalAnswer);
          } else if (char === '\u0003') {
            // Ctrl+C
            stdin.setRawMode?.(false);
            console.log('\n\n⚠️  Input cancelled by user');
            process.exit(0);
          } else if (char === '\u007f') {
            // Backspace
            if (input.length > 0) {
              input = input.slice(0, -1);
            }
          } else {
            input += char;
          }
        };

        stdin.on('data', onData);

      } else {
        // Normal visible input
        rl.question(prompt, (answer) => {
          const finalAnswer = answer.trim() || options?.defaultValue || '';

          // Validate if validator provided
          if (options?.validate) {
            const validation = options.validate(finalAnswer);
            if (validation !== true) {
              console.log(`\n❌ Invalid: ${typeof validation === 'string' ? validation : 'Please try again'}`);
              this.askHuman(question, options).then(resolve);
              return;
            }
          }

          logger.info('Human input received', { length: finalAnswer.length });
          console.log('='.repeat(60) + '\n');
          resolve(finalAnswer);
        });
      }
    });
  }

  /**
   * Ask human for confirmation (yes/no)
   */
  async confirm(question: string, defaultValue: boolean = false): Promise<boolean> {
    const answer = await this.askHuman(
      `${question} (yes/no)`,
      {
        defaultValue: defaultValue ? 'yes' : 'no',
        validate: (ans) => {
          const lower = ans.toLowerCase();
          return ['yes', 'no', 'y', 'n'].includes(lower) || 'Please answer yes or no';
        },
      }
    );

    const lower = answer.toLowerCase();
    return lower === 'yes' || lower === 'y';
  }

  /**
   * Ask human to choose from multiple options
   */
  async choose(question: string, options: string[]): Promise<string> {
    console.log('\n' + '='.repeat(60));
    console.log('🆘 AGENT NEEDS YOUR INPUT');
    console.log('='.repeat(60));
    console.log(`\n${question}\n`);
    console.log('Options:');
    options.forEach((opt, i) => {
      console.log(`  ${i + 1}. ${opt}`);
    });

    const answer = await this.askHuman(
      'Enter option number or text',
      {
        validate: (ans) => {
          const num = parseInt(ans);
          if (!isNaN(num) && num >= 1 && num <= options.length) {
            return true;
          }
          if (options.some(opt => opt.toLowerCase() === ans.toLowerCase())) {
            return true;
          }
          return `Please enter a number 1-${options.length} or one of the option texts`;
        },
      }
    );

    const num = parseInt(answer);
    if (!isNaN(num)) {
      return options[num - 1];
    }

    return options.find(opt => opt.toLowerCase() === answer.toLowerCase()) || answer;
  }

  /**
   * Ask for multiple pieces of information
   */
  async askMultiple(questions: { key: string; question: string; defaultValue?: string; validate?: (ans: string) => boolean | string }[]): Promise<Record<string, string>> {
    const answers: Record<string, string> = {};

    console.log('\n' + '='.repeat(60));
    console.log('🆘 AGENT NEEDS MULTIPLE INPUTS');
    console.log('='.repeat(60));
    console.log(`\nI need the following information (${questions.length} questions):\n`);

    for (const q of questions) {
      answers[q.key] = await this.askHuman(q.question, {
        defaultValue: q.defaultValue,
        validate: q.validate,
      });
    }

    return answers;
  }

  /**
   * Wait for human to signal ready
   */
  async waitForReady(message?: string): Promise<void> {
    await this.askHuman(
      message || "Press Enter when ready to continue",
      { defaultValue: 'ready' }
    );
  }

  /**
   * Cleanup
   */
  close(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}

// Export singleton
export const humanInput = new HumanInputManager();

// Export helper functions
export async function askHuman(question: string, defaultValue?: string): Promise<string> {
  return humanInput.askHuman(question, { defaultValue });
}

export async function confirmWithHuman(question: string, defaultValue?: boolean): Promise<boolean> {
  return humanInput.confirm(question, defaultValue);
}

export async function chooseFromOptions(question: string, options: string[]): Promise<string> {
  return humanInput.choose(question, options);
}

export async function waitForHuman(message?: string): Promise<void> {
  return humanInput.waitForReady(message);
}
