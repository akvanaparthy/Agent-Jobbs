import { Page, Locator } from 'playwright';
import { logger } from '../utils/logger';
import { ApplicationQuestion, Answer } from '../types';
import { afterClickDelay, typingDelay } from '../utils/delays';

export class FormFiller {
  constructor(private page: Page) {}

  /**
   * Helper method to type with human-like delays on a locator
   */
  private async typeWithDelay(locator: Locator, text: string): Promise<void> {
    await locator.focus();
    await this.page.waitForTimeout(100);

    for (const char of text) {
      await locator.pressSequentially(char, { delay: typingDelay() });
    }
  }

  /**
   * Fill a single form field based on question and answer
   */
  async fillField(question: ApplicationQuestion, answer: Answer): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      logger.info(`Filling field: ${question.label}`, {
        type: question.type,
        required: question.required
      });

      switch (question.type) {
        case 'text':
          return await this.fillTextInput(question, answer.answer);

        case 'textarea':
          return await this.fillTextarea(question, answer.answer);

        case 'select':
          return await this.fillSelect(question, answer.answer);

        case 'checkbox':
          return await this.fillCheckbox(question, answer.answer);

        case 'radio':
          return await this.fillRadio(question, answer.answer);

        default:
          logger.warn(`Unknown field type: ${question.type}`);
          return {
            success: false,
            error: `Unsupported field type: ${question.type}`
          };
      }
    } catch (error) {
      logger.error(`Failed to fill field: ${question.label}`, { error });
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Fill all fields with their answers
   */
  async fillAllFields(
    questionsAndAnswers: Array<{ question: ApplicationQuestion; answer: Answer }>
  ): Promise<{
    successCount: number;
    failureCount: number;
    results: Array<{ question: ApplicationQuestion; success: boolean; error?: string }>;
  }> {
    const results: Array<{ question: ApplicationQuestion; success: boolean; error?: string }> = [];
    let successCount = 0;
    let failureCount = 0;

    for (const { question, answer } of questionsAndAnswers) {
      const result = await this.fillField(question, answer);

      results.push({
        question,
        success: result.success,
        error: result.error
      });

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }

      // Small delay between fields for human-like behavior
      await afterClickDelay();
    }

    logger.info('Completed filling all fields', { successCount, failureCount });

    return {
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Fill a text input field
   */
  private async fillTextInput(question: ApplicationQuestion, value: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Find the input field by ID, name, or label
      const input = await this.findInputElement(question);

      if (!input) {
        return { success: false, error: 'Input field not found' };
      }

      // Clear existing value
      await input.clear();
      await this.page.waitForTimeout(typingDelay());

      // Type the new value with human-like delays
      await this.typeWithDelay(input, value);

      logger.debug(`Filled text input: ${question.label} = "${value}"`);

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Fill a textarea field
   */
  private async fillTextarea(question: ApplicationQuestion, value: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const textarea = await this.findTextareaElement(question);

      if (!textarea) {
        return { success: false, error: 'Textarea not found' };
      }

      // Clear existing value
      await textarea.clear();
      await this.page.waitForTimeout(typingDelay());

      // Type the new value with human-like delays
      // For longer texts, we can be slightly faster
      await this.typeWithDelay(textarea, value);

      logger.debug(`Filled textarea: ${question.label} = "${value.substring(0, 50)}..."`);

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Fill a select/dropdown field
   */
  private async fillSelect(question: ApplicationQuestion, value: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const select = await this.findSelectElement(question);

      if (!select) {
        return { success: false, error: 'Select element not found' };
      }

      // Try to select by value, label, or index
      // First try exact match
      try {
        await select.selectOption({ label: value });
        logger.debug(`Selected option by label: ${question.label} = "${value}"`);
        return { success: true };
      } catch {
        // Try by value
        try {
          await select.selectOption({ value });
          logger.debug(`Selected option by value: ${question.label} = "${value}"`);
          return { success: true };
        } catch {
          // Try partial match
          const options = question.options || [];
          const matchingOption = options.find(opt =>
            opt.toLowerCase().includes(value.toLowerCase()) ||
            value.toLowerCase().includes(opt.toLowerCase())
          );

          if (matchingOption) {
            await select.selectOption({ label: matchingOption });
            logger.debug(`Selected option by partial match: ${question.label} = "${matchingOption}"`);
            return { success: true };
          }

          return { success: false, error: `No matching option found for: ${value}` };
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Fill a checkbox field
   */
  private async fillCheckbox(question: ApplicationQuestion, value: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const checkbox = await this.findCheckboxElement(question);

      if (!checkbox) {
        return { success: false, error: 'Checkbox not found' };
      }

      // Determine if it should be checked based on the value
      const shouldCheck = this.parseCheckboxValue(value);

      // Get current state
      const isChecked = await checkbox.isChecked();

      // Only click if state needs to change
      if (isChecked !== shouldCheck) {
        await checkbox.click();
        await afterClickDelay();
        logger.debug(`${shouldCheck ? 'Checked' : 'Unchecked'}: ${question.label}`);
      } else {
        logger.debug(`Checkbox already in correct state: ${question.label}`);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Fill a radio button field
   */
  private async fillRadio(question: ApplicationQuestion, value: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Find all radio buttons with this name
      const radios = await this.findRadioElements(question);

      if (radios.length === 0) {
        return { success: false, error: 'Radio buttons not found' };
      }

      // Find the radio button that matches the value
      for (const radio of radios) {
        try {
          // Get the label for this radio
          const radioLabel = await this.getElementLabel(radio);

          if (
            radioLabel &&
            (radioLabel.toLowerCase().includes(value.toLowerCase()) ||
              value.toLowerCase().includes(radioLabel.toLowerCase()))
          ) {
            await radio.click();
            await afterClickDelay();
            logger.debug(`Selected radio: ${question.label} = "${radioLabel}"`);
            return { success: true };
          }
        } catch {
          continue;
        }
      }

      return { success: false, error: `No matching radio option found for: ${value}` };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Find input element by question
   */
  private async findInputElement(question: ApplicationQuestion) {
    try {
      // Try by ID
      if (question.id) {
        const byId = this.page.locator(`input#${question.id}`).first();
        if (await byId.isVisible({ timeout: 1000 })) {
          return byId;
        }
      }

      // Try by name
      const byName = this.page.locator(`input[name="${question.id}"]`).first();
      if (await byName.isVisible({ timeout: 1000 })) {
        return byName;
      }

      // Try by placeholder
      if (question.placeholder) {
        const byPlaceholder = this.page.locator(`input[placeholder="${question.placeholder}"]`).first();
        if (await byPlaceholder.isVisible({ timeout: 1000 })) {
          return byPlaceholder;
        }
      }

      // Try by label association
      const labelLocator = this.page.locator(`label:has-text("${question.label}")`).first();
      const forAttr = await labelLocator.getAttribute('for').catch(() => null);
      if (forAttr) {
        const byLabelFor = this.page.locator(`input#${forAttr}`).first();
        if (await byLabelFor.isVisible({ timeout: 1000 })) {
          return byLabelFor;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Find textarea element by question
   */
  private async findTextareaElement(question: ApplicationQuestion) {
    try {
      // Similar logic to findInputElement but for textareas
      if (question.id) {
        const byId = this.page.locator(`textarea#${question.id}`).first();
        if (await byId.isVisible({ timeout: 1000 })) {
          return byId;
        }
      }

      const byName = this.page.locator(`textarea[name="${question.id}"]`).first();
      if (await byName.isVisible({ timeout: 1000 })) {
        return byName;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Find select element by question
   */
  private async findSelectElement(question: ApplicationQuestion) {
    try {
      if (question.id) {
        const byId = this.page.locator(`select#${question.id}`).first();
        if (await byId.isVisible({ timeout: 1000 })) {
          return byId;
        }
      }

      const byName = this.page.locator(`select[name="${question.id}"]`).first();
      if (await byName.isVisible({ timeout: 1000 })) {
        return byName;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Find checkbox element by question
   */
  private async findCheckboxElement(question: ApplicationQuestion) {
    try {
      if (question.id) {
        const byId = this.page.locator(`input[type="checkbox"]#${question.id}`).first();
        if (await byId.isVisible({ timeout: 1000 })) {
          return byId;
        }
      }

      const byName = this.page.locator(`input[type="checkbox"][name="${question.id}"]`).first();
      if (await byName.isVisible({ timeout: 1000 })) {
        return byName;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Find radio elements by question
   */
  private async findRadioElements(question: ApplicationQuestion) {
    try {
      const radios = await this.page.locator(`input[type="radio"][name="${question.id}"]`).all();
      return radios.filter(async (radio) => await radio.isVisible());
    } catch {
      return [];
    }
  }

  /**
   * Get label text for an element
   */
  private async getElementLabel(element: any): Promise<string> {
    try {
      const id = await element.getAttribute('id');
      if (id) {
        const label = await this.page.locator(`label[for="${id}"]`).first();
        if (await label.isVisible({ timeout: 500 })) {
          return (await label.innerText()).trim();
        }
      }

      const parentLabel = element.locator('xpath=ancestor::label[1]');
      if (await parentLabel.isVisible({ timeout: 500 })) {
        return (await parentLabel.innerText()).trim();
      }

      const ariaLabel = await element.getAttribute('aria-label');
      if (ariaLabel) {
        return ariaLabel.trim();
      }

      return '';
    } catch {
      return '';
    }
  }

  /**
   * Parse checkbox value from string
   * "yes", "true", "1", "checked" => true
   * "no", "false", "0", "unchecked" => false
   */
  private parseCheckboxValue(value: string): boolean {
    const valueLower = value.toLowerCase().trim();
    const trueValues = ['yes', 'true', '1', 'checked', 'check', 'y', 'on'];
    const falseValues = ['no', 'false', '0', 'unchecked', 'uncheck', 'n', 'off'];

    if (trueValues.includes(valueLower)) {
      return true;
    }

    if (falseValues.includes(valueLower)) {
      return false;
    }

    // Default to true if unclear
    logger.warn(`Unclear checkbox value: "${value}", defaulting to true`);
    return true;
  }
}
