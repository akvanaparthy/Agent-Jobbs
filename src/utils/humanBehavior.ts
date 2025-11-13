import { Page } from 'playwright';
import { typingDelay, randomDelay, scrollDelay } from './delays';

/**
 * Type text in a human-like manner with random delays
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await page.waitForTimeout(randomDelay(200, 500));

  for (const char of text) {
    await page.keyboard.type(char, { delay: typingDelay() });
  }
}

/**
 * Click with a slight random offset to appear more human
 */
export async function humanClick(page: Page, selector: string): Promise<void> {
  const element = await page.locator(selector).first();
  const box = await element.boundingBox();

  if (box) {
    // Click at a random point within the element (not exact center)
    const x = box.x + box.width * (0.3 + Math.random() * 0.4);
    const y = box.y + box.height * (0.3 + Math.random() * 0.4);

    await page.mouse.move(x, y, { steps: randomDelay(5, 15) });
    await page.waitForTimeout(randomDelay(100, 300));
    await page.mouse.click(x, y);
  } else {
    // Fallback to regular click
    await element.click();
  }
}

/**
 * Scroll the page in a natural way
 */
export async function humanScroll(page: Page, direction: 'up' | 'down' = 'down'): Promise<void> {
  const scrollAmount = randomDelay(200, 600);
  const sign = direction === 'down' ? 1 : -1;

  await page.evaluate((amount) => {
    window.scrollBy(0, amount);
  }, scrollAmount * sign);

  await scrollDelay();
}

/**
 * Scroll to an element smoothly
 */
export async function scrollToElement(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, selector);

  await scrollDelay();
}

/**
 * Move mouse to random positions on the page (looks more human)
 */
export async function randomMouseMovement(page: Page, count: number = 3): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) return;

  for (let i = 0; i < count; i++) {
    const x = randomDelay(0, viewport.width);
    const y = randomDelay(0, viewport.height);
    const steps = randomDelay(10, 30);

    await page.mouse.move(x, y, { steps });
    await page.waitForTimeout(randomDelay(100, 500));
  }
}

/**
 * Simulate reading time (pause based on content length)
 */
export async function simulateReadingTime(page: Page, contentLength: number): Promise<void> {
  // Assume ~200 words per minute reading speed
  // Average word length is 5 characters
  const words = contentLength / 5;
  const readingTimeMs = (words / 200) * 60 * 1000;

  // Add some randomness (±25%)
  const jitter = readingTimeMs * 0.25 * (Math.random() * 2 - 1);
  const actualTime = Math.max(2000, readingTimeMs + jitter); // Min 2 seconds

  await page.waitForTimeout(Math.min(actualTime, 10000)); // Max 10 seconds
}

/**
 * Fill a form field with human-like behavior
 */
export async function fillFormField(
  page: Page,
  selector: string,
  value: string,
  fieldType: 'text' | 'textarea' | 'select' = 'text'
): Promise<void> {
  // Scroll to field
  await scrollToElement(page, selector);

  // Wait a bit before interacting
  await page.waitForTimeout(randomDelay(500, 1500));

  if (fieldType === 'select') {
    // For dropdowns
    await page.selectOption(selector, value);
  } else {
    // For text inputs
    await humanType(page, selector, value);
  }

  // Small pause after filling
  await page.waitForTimeout(randomDelay(300, 800));
}

/**
 * Check a checkbox in a human-like way
 */
export async function checkCheckbox(page: Page, selector: string, check: boolean): Promise<void> {
  await scrollToElement(page, selector);
  await page.waitForTimeout(randomDelay(500, 1000));

  const isChecked = await page.isChecked(selector);

  if (isChecked !== check) {
    await humanClick(page, selector);
  }

  await page.waitForTimeout(randomDelay(300, 700));
}

/**
 * Select a radio button
 */
export async function selectRadio(page: Page, selector: string): Promise<void> {
  await scrollToElement(page, selector);
  await page.waitForTimeout(randomDelay(500, 1000));
  await humanClick(page, selector);
  await page.waitForTimeout(randomDelay(300, 700));
}
