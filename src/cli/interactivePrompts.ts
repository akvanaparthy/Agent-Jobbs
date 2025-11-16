import inquirer from 'inquirer';
import chalk from 'chalk';
import { ApplicationQuestion, Answer } from '../types';
import { logger } from '../utils/logger';

export interface UserChoice {
  action: 'accept' | 'edit' | 'regenerate' | 'skip';
  editedAnswer?: string;
  customPrompt?: string;
}

export class InteractivePrompts {
  /**
   * Show question with proposed answer and get user's choice
   */
  async promptForAnswer(
    question: ApplicationQuestion,
    proposedAnswer: Answer,
    questionNumber: number,
    totalQuestions: number,
    jobTitle: string
  ): Promise<UserChoice> {
    console.log('\n' + chalk.cyan('━'.repeat(80)));
    console.log(chalk.bold.white(`Job: ${jobTitle}`));
    console.log(chalk.gray(`Question ${questionNumber} of ${totalQuestions}`));
    console.log(chalk.cyan('━'.repeat(80)));

    console.log('\n' + chalk.bold('Question:'), chalk.white(question.label));
    console.log(chalk.gray(`Type: ${question.type}${question.required ? ' (Required)' : ''}`));

    if (question.options && question.options.length > 0) {
      console.log(chalk.gray('Options:'), question.options.join(', '));
    }

    console.log('\n' + chalk.bold('Proposed Answer:'), chalk.yellow(proposedAnswer.answer));
    console.log(chalk.gray(`Confidence: ${(proposedAnswer.confidence * 100).toFixed(0)}%`));
    console.log(chalk.gray(`Source: ${proposedAnswer.source}`));

    if (proposedAnswer.confidence < 0.7) {
      console.log('\n' + chalk.yellow('⚠ Low confidence - you may want to review this answer'));
    }

    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'What would you like to do?',
        choices: [
          {
            name: chalk.green('✓ Accept and fill this answer'),
            value: 'accept'
          },
          {
            name: chalk.blue('✎ Edit answer manually'),
            value: 'edit'
          },
          {
            name: chalk.magenta('↻ Re-generate with custom prompt'),
            value: 'regenerate'
          },
          {
            name: chalk.red('⤫ Skip this job'),
            value: 'skip'
          }
        ]
      }
    ]);

    if (choice === 'edit') {
      const { editedAnswer } = await inquirer.prompt([
        {
          type: 'input',
          name: 'editedAnswer',
          message: 'Enter your answer:',
          default: proposedAnswer.answer
        }
      ]);

      return {
        action: 'edit',
        editedAnswer
      };
    }

    if (choice === 'regenerate') {
      const { customPrompt } = await inquirer.prompt([
        {
          type: 'input',
          name: 'customPrompt',
          message: 'Enter additional context/instructions for regeneration:'
        }
      ]);

      return {
        action: 'regenerate',
        customPrompt
      };
    }

    return { action: choice };
  }

  /**
   * Show progress while filling a field
   */
  showFillingProgress(questionLabel: string): void {
    console.log(chalk.gray(`\n→ Filling field: "${questionLabel}"...`));
  }

  /**
   * Show success message after filling
   */
  showFillingSuccess(questionLabel: string): void {
    console.log(chalk.green(`✓ Filled: "${questionLabel}"`));
  }

  /**
   * Show error message if filling failed
   */
  showFillingError(questionLabel: string, error: string): void {
    console.log(chalk.red(`✗ Failed to fill "${questionLabel}": ${error}`));
  }

  /**
   * Confirm before submitting application
   */
  async confirmSubmit(jobTitle: string, questionsCount: number): Promise<boolean> {
    console.log('\n' + chalk.yellow('━'.repeat(80)));
    console.log(chalk.bold.yellow('Ready to Submit Application'));
    console.log(chalk.yellow('━'.repeat(80)));

    console.log('\n' + chalk.white(`Job: ${jobTitle}`));
    console.log(chalk.white(`Filled ${questionsCount} questions`));
    console.log('\n' + chalk.gray('The form is ready. The submit button will be highlighted.'));
    console.log(chalk.gray('Please review the form one more time and click Submit manually.'));

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Are you ready to review and submit?',
        default: true
      }
    ]);

    return confirmed;
  }

  /**
   * Wait for user to manually submit
   */
  async waitForManualSubmit(): Promise<void> {
    console.log('\n' + chalk.cyan('━'.repeat(80)));
    console.log(chalk.bold.cyan('Waiting for Manual Submission'));
    console.log(chalk.cyan('━'.repeat(80)));

    console.log('\n' + chalk.white('Please review the form and click the Submit button when ready.'));
    console.log(chalk.gray('Press Enter after you have submitted the application...'));

    await inquirer.prompt([
      {
        type: 'input',
        name: 'submitted',
        message: 'Press Enter when done'
      }
    ]);
  }

  /**
   * Show completion summary
   */
  showCompletionSummary(
    jobTitle: string,
    success: boolean,
    questionsAnswered: number,
    autoApplied: boolean = false
  ): void {
    console.log('\n' + chalk.green('━'.repeat(80)));

    if (success) {
      if (autoApplied) {
        console.log(chalk.bold.green('✓ Application Auto-Submitted'));
      } else {
        console.log(chalk.bold.green('✓ Application Process Complete'));
      }
    } else {
      console.log(chalk.bold.yellow('⚠ Application Process Stopped'));
    }

    console.log(chalk.green('━'.repeat(80)));

    console.log('\n' + chalk.white(`Job: ${jobTitle}`));
    console.log(chalk.white(`Questions answered: ${questionsAnswered}`));

    if (autoApplied) {
      console.log('\n' + chalk.green('The application was automatically submitted by the system.'));
    } else if (success) {
      console.log('\n' + chalk.green('You manually submitted the application.'));
    } else {
      console.log('\n' + chalk.yellow('The application was not submitted.'));
    }
  }

  /**
   * Show error message
   */
  showError(message: string, details?: any): void {
    console.log('\n' + chalk.red('━'.repeat(80)));
    console.log(chalk.bold.red('✗ Error'));
    console.log(chalk.red('━'.repeat(80)));

    console.log('\n' + chalk.red(message));

    if (details) {
      console.log(chalk.gray('\nDetails:'), details);
    }
  }

  /**
   * Show info message
   */
  showInfo(message: string): void {
    console.log('\n' + chalk.blue('ℹ'), chalk.white(message));
  }

  /**
   * Show warning message
   */
  showWarning(message: string): void {
    console.log('\n' + chalk.yellow('⚠'), chalk.yellow(message));
  }

  /**
   * Prompt for continuing to next job
   */
  async promptContinueToNextJob(completedJobs: number, remainingJobs: number): Promise<boolean> {
    if (remainingJobs === 0) {
      console.log('\n' + chalk.green('All jobs processed!'));
      return false;
    }

    console.log('\n' + chalk.cyan('━'.repeat(80)));
    console.log(chalk.bold.cyan('Progress'));
    console.log(chalk.cyan('━'.repeat(80)));

    console.log('\n' + chalk.white(`Completed: ${completedJobs} jobs`));
    console.log(chalk.white(`Remaining: ${remainingJobs} jobs`));

    const { shouldContinue } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldContinue',
        message: 'Continue to next job?',
        default: true
      }
    ]);

    return shouldContinue;
  }

  /**
   * Show modal detection result
   */
  showModalDetection(type: 'modal' | 'auto-applied' | 'external' | 'none', details: any): void {
    console.log('\n' + chalk.blue('━'.repeat(80)));
    console.log(chalk.bold.blue('Application Response Detected'));
    console.log(chalk.blue('━'.repeat(80)));

    switch (type) {
      case 'modal':
        console.log('\n' + chalk.green('✓ Application form opened'));
        console.log(chalk.gray(`Form fields: ${details.formFieldsCount}`));
        console.log(chalk.gray(`Multiple steps: ${details.hasMultipleSteps ? 'Yes' : 'No'}`));
        break;

      case 'auto-applied':
        console.log('\n' + chalk.green('✓ Application automatically submitted'));
        console.log(chalk.gray(`Message: ${details.message}`));
        break;

      case 'external':
        console.log('\n' + chalk.yellow('⚠ Redirected to external application page'));
        console.log(chalk.gray(`URL: ${details.redirectUrl}`));
        console.log(chalk.gray('Cannot handle external applications automatically'));
        break;

      case 'none':
        console.log('\n' + chalk.red('✗ No application response detected'));
        if (details.error) {
          console.log(chalk.red(`Error: ${details.error}`));
        }
        break;
    }
  }

  /**
   * Show step navigation
   */
  showStepNavigation(currentStep: number, totalSteps: number, questionsOnStep: number): void {
    console.log('\n' + chalk.magenta('━'.repeat(80)));
    console.log(chalk.bold.magenta(`Step ${currentStep} of ${totalSteps}`));
    console.log(chalk.magenta('━'.repeat(80)));

    console.log('\n' + chalk.white(`Questions on this step: ${questionsOnStep}`));
  }
}
