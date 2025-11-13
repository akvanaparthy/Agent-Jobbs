import { Page, Locator } from 'playwright';
import { logger } from '../utils/logger';
import { ApplicationQuestion } from '../types';
import { afterClickDelay, pageLoadDelay } from '../utils/delays';
import { humanClick } from '../utils/humanBehavior';
import * as crypto from 'crypto';

export class QuestionDetector {
  constructor(private page: Page) {}

  /**
   * Click the 1-Click Apply button
   */
  async clickApplyButton(): Promise<boolean> {
    try {
      logger.info('Looking for 1-Click Apply button');

      const buttonSelectors = [
        'button:has-text("1-Click Apply")',
        'button:has-text("Quick Apply")',
        'button:has-text("Easy Apply")',
        'button:has-text("Apply Now")',
        '[data-test="quick-apply"]',
        '[data-test="one-click-apply"]',
        'button[class*="QuickApply"]',
      ];

      for (const selector of buttonSelectors) {
        try {
          const button = this.page.locator(selector).first();
          if (await button.isVisible({ timeout: 2000 })) {
            logger.info('Found apply button', { selector });
            await humanClick(this.page, selector);
            await afterClickDelay();
            return true;
          }
        } catch {
          continue;
        }
      }

      logger.warn('Apply button not found');
      return false;
    } catch (error) {
      logger.error('Failed to click apply button', { error });
      return false;
    }
  }

  /**
   * Detect application form/modal
   */
  async waitForApplicationForm(): Promise<boolean> {
    try {
      logger.info('Waiting for application form');

      const formSelectors = [
        '[data-test="application-form"]',
        '[role="dialog"]',
        '.modal',
        '.application-modal',
        '[class*="Modal"]',
        '[class*="dialog"]',
      ];

      for (const selector of formSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          logger.info('Application form detected', { selector });
          return true;
        } catch {
          continue;
        }
      }

      // Check if there are any form elements on the page
      const hasFormElements = await this.page.locator('input, textarea, select').count();
      if (hasFormElements > 0) {
        logger.info('Form elements detected (no modal)');
        return true;
      }

      logger.warn('No application form detected');
      return false;
    } catch (error) {
      logger.error('Error detecting application form', { error });
      return false;
    }
  }

  /**
   * Detect all questions in the application form
   */
  async detectQuestions(): Promise<ApplicationQuestion[]> {
    try {
      logger.info('Detecting application questions');

      await pageLoadDelay();

      const questions: ApplicationQuestion[] = [];

      // Detect text inputs
      const textInputs = await this.detectTextInputs();
      questions.push(...textInputs);

      // Detect textareas
      const textareas = await this.detectTextareas();
      questions.push(...textareas);

      // Detect selects/dropdowns
      const selects = await this.detectSelects();
      questions.push(...selects);

      // Detect checkboxes
      const checkboxes = await this.detectCheckboxes();
      questions.push(...checkboxes);

      // Detect radio buttons
      const radios = await this.detectRadios();
      questions.push(...radios);

      logger.info(`Detected ${questions.length} questions`);

      return questions;
    } catch (error) {
      logger.error('Failed to detect questions', { error });
      return [];
    }
  }

  /**
   * Detect text input fields
   */
  private async detectTextInputs(): Promise<ApplicationQuestion[]> {
    const questions: ApplicationQuestion[] = [];

    try {
      const inputs = await this.page.locator('input[type="text"], input:not([type])').all();

      for (const input of inputs) {
        try {
          // Skip hidden inputs
          if (!(await input.isVisible())) continue;

          const id = await this.generateFieldId(input);
          const label = await this.getFieldLabel(input);
          const placeholder = await input.getAttribute('placeholder');
          const required = await input.getAttribute('required') !== null;

          if (label) {
            questions.push({
              id,
              type: 'text',
              label,
              required,
              placeholder: placeholder || undefined,
            });
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      logger.debug('No text inputs detected');
    }

    return questions;
  }

  /**
   * Detect textarea fields
   */
  private async detectTextareas(): Promise<ApplicationQuestion[]> {
    const questions: ApplicationQuestion[] = [];

    try {
      const textareas = await this.page.locator('textarea').all();

      for (const textarea of textareas) {
        try {
          if (!(await textarea.isVisible())) continue;

          const id = await this.generateFieldId(textarea);
          const label = await this.getFieldLabel(textarea);
          const placeholder = await textarea.getAttribute('placeholder');
          const required = await textarea.getAttribute('required') !== null;

          if (label) {
            questions.push({
              id,
              type: 'textarea',
              label,
              required,
              placeholder: placeholder || undefined,
            });
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      logger.debug('No textareas detected');
    }

    return questions;
  }

  /**
   * Detect select/dropdown fields
   */
  private async detectSelects(): Promise<ApplicationQuestion[]> {
    const questions: ApplicationQuestion[] = [];

    try {
      const selects = await this.page.locator('select').all();

      for (const select of selects) {
        try {
          if (!(await select.isVisible())) continue;

          const id = await this.generateFieldId(select);
          const label = await this.getFieldLabel(select);
          const required = await select.getAttribute('required') !== null;

          // Get options
          const options = await select.locator('option').allTextContents();
          const filteredOptions = options.filter(opt => opt && opt.trim());

          if (label && filteredOptions.length > 0) {
            questions.push({
              id,
              type: 'select',
              label,
              required,
              options: filteredOptions,
            });
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      logger.debug('No selects detected');
    }

    return questions;
  }

  /**
   * Detect checkboxes
   */
  private async detectCheckboxes(): Promise<ApplicationQuestion[]> {
    const questions: ApplicationQuestion[] = [];

    try {
      const checkboxes = await this.page.locator('input[type="checkbox"]').all();

      for (const checkbox of checkboxes) {
        try {
          if (!(await checkbox.isVisible())) continue;

          const id = await this.generateFieldId(checkbox);
          const label = await this.getFieldLabel(checkbox);
          const required = await checkbox.getAttribute('required') !== null;

          if (label) {
            questions.push({
              id,
              type: 'checkbox',
              label,
              required,
            });
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      logger.debug('No checkboxes detected');
    }

    return questions;
  }

  /**
   * Detect radio buttons
   */
  private async detectRadios(): Promise<ApplicationQuestion[]> {
    const questions: ApplicationQuestion[] = [];

    try {
      // Group radio buttons by name
      const radioGroups = new Map<string, Locator[]>();

      const radios = await this.page.locator('input[type="radio"]').all();

      for (const radio of radios) {
        try {
          if (!(await radio.isVisible())) continue;

          const name = await radio.getAttribute('name');
          if (name) {
            if (!radioGroups.has(name)) {
              radioGroups.set(name, []);
            }
            radioGroups.get(name)!.push(radio);
          }
        } catch {
          continue;
        }
      }

      // Create a question for each radio group
      for (const [name, radios] of radioGroups.entries()) {
        try {
          const firstRadio = radios[0];
          const id = await this.generateFieldId(firstRadio);
          const label = await this.getFieldLabel(firstRadio);
          const required = await firstRadio.getAttribute('required') !== null;

          // Get labels for all options
          const options: string[] = [];
          for (const radio of radios) {
            const optionLabel = await this.getFieldLabel(radio);
            if (optionLabel) {
              options.push(optionLabel);
            }
          }

          if (label && options.length > 0) {
            questions.push({
              id,
              type: 'radio',
              label,
              required,
              options,
            });
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      logger.debug('No radio buttons detected');
    }

    return questions;
  }

  /**
   * Get label for a form field
   */
  private async getFieldLabel(element: Locator): Promise<string> {
    try {
      // Try to get associated label
      const id = await element.getAttribute('id');

      if (id) {
        const label = await this.page.locator(`label[for="${id}"]`).first();
        if (await label.isVisible({ timeout: 500 })) {
          return (await label.innerText()).trim();
        }
      }

      // Try to find parent label
      const parentLabel = element.locator('xpath=ancestor::label[1]');
      if (await parentLabel.isVisible({ timeout: 500 })) {
        return (await parentLabel.innerText()).trim();
      }

      // Try to find previous sibling that might be a label
      const ariaLabel = await element.getAttribute('aria-label');
      if (ariaLabel) {
        return ariaLabel.trim();
      }

      // Try placeholder as last resort
      const placeholder = await element.getAttribute('placeholder');
      if (placeholder) {
        return placeholder.trim();
      }

      // Try name attribute
      const name = await element.getAttribute('name');
      if (name) {
        return name.replace(/[-_]/g, ' ').trim();
      }

      return '';
    } catch {
      return '';
    }
  }

  /**
   * Generate unique ID for form field
   */
  private async generateFieldId(element: Locator): Promise<string> {
    try {
      // Try to use existing ID
      const existingId = await element.getAttribute('id');
      if (existingId) {
        return existingId;
      }

      // Generate from name
      const name = await element.getAttribute('name');
      if (name) {
        return name;
      }

      // Generate from label
      const label = await this.getFieldLabel(element);
      if (label) {
        return crypto.createHash('md5').update(label).digest('hex').substring(0, 12);
      }

      // Random fallback
      return `field_${crypto.randomBytes(6).toString('hex')}`;
    } catch {
      return `field_${crypto.randomBytes(6).toString('hex')}`;
    }
  }

  /**
   * Check if there are more steps/pages in the application
   */
  async hasNextStep(): Promise<boolean> {
    try {
      const nextButtonSelectors = [
        'button:has-text("Next")',
        'button:has-text("Continue")',
        '[data-test="next-step"]',
        'button[type="button"]:has-text("Next")',
      ];

      for (const selector of nextButtonSelectors) {
        const button = this.page.locator(selector).first();
        if (await button.isVisible({ timeout: 1000 })) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Click to go to next step
   */
  async goToNextStep(): Promise<boolean> {
    try {
      const nextButtonSelectors = [
        'button:has-text("Next")',
        'button:has-text("Continue")',
        '[data-test="next-step"]',
      ];

      for (const selector of nextButtonSelectors) {
        try {
          const button = this.page.locator(selector).first();
          if (await button.isVisible({ timeout: 1000 })) {
            await humanClick(this.page, selector);
            await pageLoadDelay();
            return true;
          }
        } catch {
          continue;
        }
      }

      return false;
    } catch (error) {
      logger.error('Failed to go to next step', { error });
      return false;
    }
  }
}
