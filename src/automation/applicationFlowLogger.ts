import { Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';

interface ActionLog {
  timestamp: string;
  action: string;
  details: any;
  success: boolean;
  error?: string;
}

interface ApplicationFlowLog {
  jobId: string;
  jobTitle: string;
  jobUrl: string;
  startTime: string;
  endTime?: string;
  status: 'in_progress' | 'completed' | 'failed' | 'skipped';
  actions: ActionLog[];
  htmlSnapshots: { [step: string]: string };
  screenshots: { [step: string]: string };
  questions: any[];
  result?: {
    applied: boolean;
    autoApplied: boolean;
    externalRedirect: boolean;
    error?: string;
  };
}

export class ApplicationFlowLogger {
  private log: ApplicationFlowLog;
  private logsDir: string;
  private screenshotsDir: string;

  constructor(
    jobId: string,
    jobTitle: string,
    jobUrl: string
  ) {
    this.logsDir = path.join(process.cwd(), 'data', 'logs', 'application-flows');
    this.screenshotsDir = path.join(this.logsDir, 'screenshots', jobId);

    this.log = {
      jobId,
      jobTitle,
      jobUrl,
      startTime: new Date().toISOString(),
      status: 'in_progress',
      actions: [],
      htmlSnapshots: {},
      screenshots: {},
      questions: []
    };
  }

  /**
   * Log an action with details
   */
  logAction(action: string, details: any, success: boolean = true, error?: string): void {
    const actionLog: ActionLog = {
      timestamp: new Date().toISOString(),
      action,
      details,
      success,
      error
    };

    this.log.actions.push(actionLog);

    const logLevel = success ? 'info' : 'error';
    logger[logLevel](`[ApplicationFlow] ${action}`, { details, error });
  }

  /**
   * Capture HTML snapshot at a specific step
   */
  async captureHtmlSnapshot(page: Page, stepName: string): Promise<void> {
    try {
      const html = await page.content();
      this.log.htmlSnapshots[stepName] = html;
      this.logAction('HTML Snapshot Captured', { step: stepName, htmlLength: html.length });
    } catch (error) {
      this.logAction('HTML Snapshot Failed', { step: stepName }, false, (error as Error).message);
    }
  }

  /**
   * Capture screenshot at a specific step
   */
  async captureScreenshot(page: Page, stepName: string): Promise<void> {
    try {
      await fs.mkdir(this.screenshotsDir, { recursive: true });

      const filename = `${stepName}-${Date.now()}.png`;
      const filepath = path.join(this.screenshotsDir, filename);

      await page.screenshot({ path: filepath, fullPage: true });

      this.log.screenshots[stepName] = filepath;
      this.logAction('Screenshot Captured', { step: stepName, path: filepath });
    } catch (error) {
      this.logAction('Screenshot Failed', { step: stepName }, false, (error as Error).message);
    }
  }

  /**
   * Log detected questions
   */
  logQuestions(stepNumber: number, questions: any[]): void {
    this.log.questions.push({
      step: stepNumber,
      count: questions.length,
      questions
    });

    this.logAction('Questions Detected', {
      step: stepNumber,
      count: questions.length,
      questionLabels: questions.map(q => q.label)
    });
  }

  /**
   * Log modal/popup detection result
   */
  logModalDetection(
    detected: boolean,
    modalType: 'dialog' | 'form' | 'external' | 'auto-applied' | 'none',
    details: any
  ): void {
    this.logAction('Modal Detection', {
      detected,
      type: modalType,
      ...details
    }, detected);
  }

  /**
   * Log field fill action
   */
  logFieldFill(
    fieldLabel: string,
    fieldType: string,
    value: string,
    success: boolean,
    error?: string
  ): void {
    this.logAction('Field Fill', {
      label: fieldLabel,
      type: fieldType,
      value,
      success
    }, success, error);
  }

  /**
   * Log navigation to next step
   */
  logNextStep(stepNumber: number, buttonText: string): void {
    this.logAction('Navigate to Next Step', {
      fromStep: stepNumber,
      toStep: stepNumber + 1,
      buttonClicked: buttonText
    });
  }

  /**
   * Log final result
   */
  logResult(result: ApplicationFlowLog['result']): void {
    this.log.result = result;
    this.log.status = result?.applied ? 'completed' : result?.error ? 'failed' : 'skipped';
    this.log.endTime = new Date().toISOString();

    this.logAction('Application Flow Completed', result || {});
  }

  /**
   * Save the complete log to file
   */
  async save(): Promise<string> {
    try {
      await fs.mkdir(this.logsDir, { recursive: true });

      const filename = `application-flow-${this.log.jobId}-${Date.now()}.json`;
      const filepath = path.join(this.logsDir, filename);

      // Save main log
      await fs.writeFile(
        filepath,
        JSON.stringify(this.log, null, 2),
        'utf-8'
      );

      // Also save HTML snapshots as separate files for easier viewing
      for (const [step, html] of Object.entries(this.log.htmlSnapshots)) {
        const htmlFile = path.join(this.logsDir, `${this.log.jobId}-${step}.html`);
        await fs.writeFile(htmlFile, html, 'utf-8');
      }

      logger.info(`Application flow log saved: ${filepath}`);
      return filepath;
    } catch (error) {
      logger.error('Failed to save application flow log:', error);
      throw error;
    }
  }

  /**
   * Get summary of the log
   */
  getSummary(): any {
    const duration = this.log.endTime
      ? new Date(this.log.endTime).getTime() - new Date(this.log.startTime).getTime()
      : null;

    return {
      jobId: this.log.jobId,
      jobTitle: this.log.jobTitle,
      status: this.log.status,
      duration: duration ? `${(duration / 1000).toFixed(2)}s` : 'ongoing',
      totalActions: this.log.actions.length,
      totalQuestions: this.log.questions.reduce((sum, q) => sum + q.count, 0),
      totalSteps: this.log.questions.length,
      snapshots: Object.keys(this.log.htmlSnapshots).length,
      screenshots: Object.keys(this.log.screenshots).length,
      result: this.log.result
    };
  }
}
