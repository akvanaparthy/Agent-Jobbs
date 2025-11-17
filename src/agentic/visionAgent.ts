/**
 * VisionAgent - Uses Claude's vision capabilities to understand and interact with browser UI
 */

import Anthropic from '@anthropic-ai/sdk';
import { Page } from 'playwright';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { ScreenAnalysis, DetectedElement, UIState } from './types';

export class VisionAgent {
  private client: Anthropic;
  private model: string = 'claude-3-5-sonnet-20241022';

  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
  }

  /**
   * Analyze a screenshot to understand what's on screen
   */
  async analyzeScreen(screenshot: Buffer): Promise<ScreenAnalysis> {
    logger.info('🔍 Analyzing screen with vision...');

    const base64Image = screenshot.toString('base64');

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `You are analyzing a screenshot of a web page in a browser automation context.

Analyze this screen and provide:

1. **Description**: What do you see? Be specific about the page type and content.
2. **UI State**: Classify the page state as one of:
   - login_page
   - cloudflare_challenge
   - job_search_page
   - job_listing_page
   - job_detail_page
   - application_form
   - application_submitted
   - error_page
   - unknown

3. **Interactive Elements**: List all clickable/interactable elements you see with:
   - Description (e.g., "Sign In button in top right")
   - Type (button, input, link, dropdown, checkbox, text)
   - Approximate coordinates if visible (x, y as percentages of screen 0-100)

4. **Page Type**: What kind of page is this? (e.g., "ZipRecruiter job search results", "Login form", "Application page")

5. **Requires Action**: Does this page need user interaction to proceed? (true/false)

6. **Suggested Actions**: If action is needed, what would a human do next? List 2-3 suggestions.

Return your analysis as JSON with this exact structure:
{
  "description": "detailed description",
  "uiState": "state_name",
  "interactiveElements": [
    {
      "description": "element description",
      "type": "button|input|link|dropdown|checkbox|text",
      "coordinates": {"x": 0-100, "y": 0-100},
      "text": "visible text if any"
    }
  ],
  "pageType": "page type description",
  "requiresAction": true/false,
  "suggestedActions": ["action 1", "action 2"]
}

Be thorough but concise. Focus on actionable elements.`,
            },
          ],
        },
      ],
    });

    const response = message.content[0];
    if (response.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Parse JSON from response
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('Failed to parse JSON from vision response', { response: response.text });
      throw new Error('Failed to parse vision analysis');
    }

    const analysis: ScreenAnalysis = JSON.parse(jsonMatch[0]);
    logger.info('✅ Screen analysis complete', {
      uiState: analysis.uiState,
      pageType: analysis.pageType,
      elementCount: analysis.interactiveElements.length,
    });

    return analysis;
  }

  /**
   * Find a specific element by natural language description
   */
  async findElement(screenshot: Buffer, description: string): Promise<DetectedElement | null> {
    logger.info('🎯 Finding element:', { description });

    const base64Image = screenshot.toString('base64');

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `Find this element on the screen: "${description}"

If you find it, return JSON with:
{
  "found": true,
  "description": "exact description of what you found",
  "type": "button|input|link|dropdown|checkbox|text",
  "coordinates": {"x": percentage (0-100), "y": percentage (0-100)},
  "text": "visible text on the element"
}

If you don't find it, return:
{
  "found": false,
  "reason": "why you couldn't find it"
}

Be precise with coordinates - they will be used for clicking.`,
            },
          ],
        },
      ],
    });

    const response = message.content[0];
    if (response.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('Failed to parse element finding response');
      return null;
    }

    const result = JSON.parse(jsonMatch[0]);

    if (!result.found) {
      logger.warn('Element not found', { description, reason: result.reason });
      return null;
    }

    logger.info('✅ Element found', {
      description: result.description,
      type: result.type,
      coordinates: result.coordinates,
    });

    return {
      description: result.description,
      type: result.type,
      coordinates: result.coordinates,
      text: result.text,
    };
  }

  /**
   * Plan a sequence of actions to achieve a goal on the current screen
   */
  async planActions(screenshot: Buffer, goal: string, currentState: string): Promise<string[]> {
    logger.info('📋 Planning actions for goal:', { goal });

    const base64Image = screenshot.toString('base64');

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `Goal: ${goal}
Current State: ${currentState}

Looking at this screen, what actions should be taken to make progress toward the goal?

Return a JSON array of action descriptions in order:
{
  "actions": [
    "Click the 'Sign In' button in the top right",
    "Fill the email field with the user's email",
    "Click the 'Continue' button"
  ]
}

Keep actions specific and actionable. Focus on immediate next steps (2-5 actions max).`,
            },
          ],
        },
      ],
    });

    const response = message.content[0];
    if (response.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('Failed to parse action plan');
      return [];
    }

    const result = JSON.parse(jsonMatch[0]);
    logger.info('✅ Action plan created', { actionCount: result.actions.length });

    return result.actions;
  }

  /**
   * Detect UI state from screenshot
   */
  async detectState(screenshot: Buffer): Promise<UIState> {
    const analysis = await this.analyzeScreen(screenshot);
    return analysis.uiState;
  }

  /**
   * Check if an element is visible on screen
   */
  async isElementVisible(screenshot: Buffer, description: string): Promise<boolean> {
    const element = await this.findElement(screenshot, description);
    return element !== null;
  }

  /**
   * Extract text content from a specific area
   */
  async extractText(screenshot: Buffer, area: string): Promise<string> {
    logger.info('📝 Extracting text from:', { area });

    const base64Image = screenshot.toString('base64');

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `Extract all text from this area: "${area}"

Return JSON:
{
  "text": "extracted text content",
  "found": true/false
}`,
            },
          ],
        },
      ],
    });

    const response = message.content[0];
    if (response.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return '';
    }

    const result = JSON.parse(jsonMatch[0]);
    return result.found ? result.text : '';
  }
}

// Export singleton
export const visionAgent = new VisionAgent();
