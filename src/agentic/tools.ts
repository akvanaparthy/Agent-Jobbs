/**
 * Tool Registry - Defines all tools available to the agent
 */

import { Page } from 'playwright';
import { z } from 'zod';
import { Tool, ToolResult, AgentContext } from './types';
import { visionAgent } from './visionAgent';
import { logger } from '../utils/logger';
import { humanInput } from './humanInput';
import { userDataManager } from './userDataManager';
import { chromaDB } from '../storage/chromaDB';
import { matcherAgent } from '../agents/matcherAgent';
import { qaAgent } from '../agents/qaAgent';
import { JobListing } from '../types';

/**
 * Navigate to a URL
 */
export const navigateTool: Tool = {
  name: 'navigate',
  description: 'Navigate the browser to a specific URL',
  parameters: z.object({
    url: z.string().url().describe('The URL to navigate to'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('🌐 Navigating to:', { url: params.url });
      await context.page.goto(params.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await context.page.waitForTimeout(2000); // Wait for page to stabilize

      return {
        success: true,
        result: { url: params.url },
      };
    } catch (error) {
      logger.error('Navigation failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Find and click an element by description
 */
export const clickTool: Tool = {
  name: 'click',
  description: 'Find an element by natural language description and click it',
  parameters: z.object({
    description: z.string().describe('Description of the element to click (e.g., "Sign In button in top right")'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('🖱️  Attempting to click:', { description: params.description });

      // Take screenshot
      const screenshot = await context.page.screenshot();

      // Find element with vision
      const element = await visionAgent.findElement(screenshot, params.description);

      if (!element || !element.coordinates) {
        return {
          success: false,
          error: `Element not found: ${params.description}`,
        };
      }

      // Convert percentage coordinates to pixels
      const viewport = context.page.viewportSize();
      if (!viewport) {
        throw new Error('No viewport size available');
      }

      const x = (element.coordinates.x / 100) * viewport.width;
      const y = (element.coordinates.y / 100) * viewport.height;

      // Click at coordinates
      await context.page.mouse.click(x, y);
      await context.page.waitForTimeout(1000); // Wait for click to process

      logger.info('✅ Click successful', { description: params.description });

      return {
        success: true,
        result: { element: element.description },
      };
    } catch (error) {
      logger.error('Click failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Type text into an input field
 */
export const typeTool: Tool = {
  name: 'type',
  description: 'Find an input field by description and type text into it',
  parameters: z.object({
    fieldDescription: z.string().describe('Description of the input field (e.g., "email input field")'),
    text: z.string().describe('Text to type into the field'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('⌨️  Attempting to type:', {
        field: params.fieldDescription,
        text: params.text.substring(0, 20) + '...',
      });

      // Take screenshot
      const screenshot = await context.page.screenshot();

      // Find element with vision
      const element = await visionAgent.findElement(screenshot, params.fieldDescription);

      if (!element || !element.coordinates) {
        return {
          success: false,
          error: `Input field not found: ${params.fieldDescription}`,
        };
      }

      // Convert percentage coordinates to pixels
      const viewport = context.page.viewportSize();
      if (!viewport) {
        throw new Error('No viewport size available');
      }

      const x = (element.coordinates.x / 100) * viewport.width;
      const y = (element.coordinates.y / 100) * viewport.height;

      // Click to focus
      await context.page.mouse.click(x, y);
      await context.page.waitForTimeout(500);

      // Type text with human-like delays
      await context.page.keyboard.type(params.text, { delay: 50 + Math.random() * 50 });
      await context.page.waitForTimeout(500);

      logger.info('✅ Typing successful');

      return {
        success: true,
        result: { field: element.description },
      };
    } catch (error) {
      logger.error('Typing failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Extract text from a specific area
 */
export const extractTextTool: Tool = {
  name: 'extract_text',
  description: 'Extract text content from a specific area of the page',
  parameters: z.object({
    area: z.string().describe('Description of the area to extract text from (e.g., "job title", "main content")'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('📝 Extracting text from:', { area: params.area });

      const screenshot = await context.page.screenshot();
      const text = await visionAgent.extractText(screenshot, params.area);

      return {
        success: true,
        result: { text },
      };
    } catch (error) {
      logger.error('Text extraction failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Wait for a specific amount of time
 */
export const waitTool: Tool = {
  name: 'wait',
  description: 'Wait for a specified amount of time (in milliseconds)',
  parameters: z.object({
    ms: z.number().min(100).max(30000).describe('Milliseconds to wait'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('⏳ Waiting:', { ms: params.ms });
      await context.page.waitForTimeout(params.ms);

      return {
        success: true,
        result: { waited: params.ms },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Take a screenshot and analyze it
 */
export const analyzeTool: Tool = {
  name: 'analyze_screen',
  description: 'Take a screenshot and get detailed analysis of what is currently visible',
  parameters: z.object({}),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('🔍 Analyzing current screen...');

      const screenshot = await context.page.screenshot();
      const analysis = await visionAgent.analyzeScreen(screenshot);

      return {
        success: true,
        result: { analysis },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Scroll the page
 */
export const scrollTool: Tool = {
  name: 'scroll',
  description: 'Scroll the page in a specific direction',
  parameters: z.object({
    direction: z.enum(['up', 'down', 'top', 'bottom']).describe('Direction to scroll'),
    amount: z.number().optional().describe('Amount to scroll in pixels (for up/down)'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('📜 Scrolling:', params);

      if (params.direction === 'top') {
        await context.page.evaluate(() => window.scrollTo(0, 0));
      } else if (params.direction === 'bottom') {
        await context.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      } else if (params.direction === 'down') {
        const amount = params.amount || 500;
        await context.page.evaluate((px) => window.scrollBy(0, px), amount);
      } else if (params.direction === 'up') {
        const amount = params.amount || 500;
        await context.page.evaluate((px) => window.scrollBy(0, -px), amount);
      }

      await context.page.waitForTimeout(1000); // Wait for scroll to complete

      return {
        success: true,
        result: { direction: params.direction },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Press a keyboard key
 */
export const pressKeyTool: Tool = {
  name: 'press_key',
  description: 'Press a keyboard key (e.g., Enter, Escape, Tab)',
  parameters: z.object({
    key: z.string().describe('Key to press (e.g., "Enter", "Escape", "Tab")'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('⌨️  Pressing key:', { key: params.key });
      await context.page.keyboard.press(params.key);
      await context.page.waitForTimeout(500);

      return {
        success: true,
        result: { key: params.key },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Ask human for input when uncertain
 */
export const askHumanTool: Tool = {
  name: 'ask_human',
  description: 'Ask the human user for input when you are uncertain, need information you don\'t have, or need confirmation before taking an action. Use this for form fields you don\'t know the value for (phone number, address, preferences, etc.)',
  parameters: z.object({
    question: z.string().describe('The question to ask the human'),
    context: z.string().optional().describe('Additional context about why you\'re asking (optional)'),
    saveToProfile: z.boolean().optional().describe('Whether to save the answer to user profile for future use (default: true)'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('🤔 Asking human for input:', { question: params.question });

      // Show context if provided
      if (params.context) {
        console.log(`\n📝 Context: ${params.context}`);
      }

      const answer = await humanInput.askHuman(params.question);

      logger.info('Human provided answer', { answerLength: answer.length });

      return {
        success: true,
        result: { answer },
      };
    } catch (error) {
      logger.error('Failed to get human input', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Get value from user profile or ask human
 */
export const getUserDataTool: Tool = {
  name: 'get_user_data',
  description: 'Get a value from the user\'s profile (phone, address, preferences, etc.). If not found, will ask the human and save it for future use. Use this before filling form fields.',
  parameters: z.object({
    field: z.string().describe('The field to get (e.g., "personalInfo.phone", "workAuth.authorized", "preferences.remotePreference")'),
    question: z.string().describe('Question to ask if value not found (e.g., "What is your phone number?")'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('📋 Getting user data:', { field: params.field });

      const value = await userDataManager.getOrAsk(params.field, params.question);

      logger.info('User data retrieved', { field: params.field, value });

      return {
        success: true,
        result: { value },
      };
    } catch (error) {
      logger.error('Failed to get user data', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Match job title with resume
 */
export const matchJobTitleTool: Tool = {
  name: 'match_job_title',
  description: 'Analyze if a job title matches the candidate\'s resume profile. Returns a match score (0.0-1.0) and reasoning. Use this to quickly filter jobs before detailed analysis.',
  parameters: z.object({
    jobTitle: z.string().describe('The job title to match against resume'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('🎯 Matching job title with resume:', { jobTitle: params.jobTitle });

      const result = await matcherAgent.matchTitle(params.jobTitle);

      logger.info('Title match complete', { 
        score: result.score, 
        reasoning: result.reasoning 
      });

      return {
        success: true,
        result: {
          score: result.score,
          reasoning: result.reasoning,
          passes: result.score >= 0.6, // Configurable threshold
        },
      };
    } catch (error) {
      logger.error('Failed to match job title', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Match full job description with resume
 */
export const matchJobDescriptionTool: Tool = {
  name: 'match_job_description',
  description: 'Perform comprehensive analysis of a job description against the candidate\'s resume. Returns detailed match report with skills, experience, strengths, and concerns. Use after title match passes.',
  parameters: z.object({
    jobTitle: z.string().describe('Job title'),
    company: z.string().describe('Company name'),
    description: z.string().describe('Full job description'),
    location: z.string().optional().describe('Job location'),
    salary: z.string().optional().describe('Salary range if available'),
    url: z.string().optional().describe('Job posting URL'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('🔍 Analyzing full job description:', { 
        title: params.jobTitle,
        company: params.company 
      });

      // Create job listing object
      const job: JobListing = {
        id: `temp-${Date.now()}`,
        title: params.jobTitle,
        company: params.company,
        location: params.location || 'Not specified',
        salary: params.salary,
        postedDate: new Date().toISOString(),
        url: params.url || context.page.url(),
        description: params.description,
        hasOneClickApply: false,
        scrapedAt: new Date().toISOString(),
      };

      const matchReport = await matcherAgent.matchDescription(job);

      logger.info('Description match complete', { 
        overallScore: matchReport.overallScore,
        skillsMatch: matchReport.skillsMatch,
        experienceMatch: matchReport.experienceMatch,
      });

      return {
        success: true,
        result: {
          ...matchReport,
          shouldApply: matchReport.overallScore >= 0.6, // Configurable
        },
      };
    } catch (error) {
      logger.error('Failed to match job description', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Answer question using resume context
 */
export const answerFromResumeTool: Tool = {
  name: 'answer_from_resume',
  description: 'Answer an application form question by searching the resume for relevant context. Returns an answer based on resume content. Use this before asking human.',
  parameters: z.object({
    question: z.string().describe('The question text from the application form'),
    questionType: z.enum(['text', 'textarea', 'select', 'radio', 'checkbox']).describe('Type of form field'),
    options: z.array(z.string()).optional().describe('Available options for select/radio questions'),
    required: z.boolean().optional().describe('Whether the question is required'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('📝 Answering question from resume:', { question: params.question });

      // Create a minimal job object (we don't have full job context in this tool)
      const job: JobListing = {
        id: 'current',
        title: 'Unknown',
        company: 'Unknown',
        location: 'Unknown',
        postedDate: new Date().toISOString(),
        url: context.page.url(),
        description: '',
        hasOneClickApply: false,
        scrapedAt: new Date().toISOString(),
      };

      const answer = await qaAgent.answerQuestion(
        {
          id: `temp-q-${Date.now()}`,
          label: params.question,
          type: params.questionType,
          options: params.options,
          required: params.required ?? false,
        },
        job
      );

      logger.info('Answer generated from resume', { 
        answer: answer.answer,
        confidence: answer.confidence 
      });

      return {
        success: true,
        result: {
          answer: answer.answer,
          confidence: answer.confidence,
          source: answer.source,
          shouldAskHuman: answer.confidence < 0.5, // Low confidence
        },
      };
    } catch (error) {
      logger.error('Failed to answer from resume', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Search for similar past Q&A pairs
 */
export const searchPastQATool: Tool = {
  name: 'search_past_qa',
  description: 'Search ChromaDB for similar questions answered in the past. Returns cached answers if found. Use this FIRST before generating new answers.',
  parameters: z.object({
    question: z.string().describe('The question to search for'),
    limit: z.number().optional().describe('Maximum number of similar questions to return (default: 3)'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('🔎 Searching past Q&A pairs:', { question: params.question });

      const similarQA = await chromaDB.searchSimilarQuestions(
        params.question,
        params.limit || 3
      );

      if (similarQA.length > 0) {
        logger.info(`Found ${similarQA.length} similar past questions`);
        
        return {
          success: true,
          result: {
            found: true,
            count: similarQA.length,
            topMatch: similarQA[0],
            allMatches: similarQA,
          },
        };
      } else {
        logger.info('No similar past questions found');
        
        return {
          success: true,
          result: {
            found: false,
            count: 0,
          },
        };
      }
    } catch (error) {
      logger.error('Failed to search past Q&A', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Save Q&A pair for future use
 */
export const saveQAPairTool: Tool = {
  name: 'save_qa_pair',
  description: 'Save a question-answer pair to ChromaDB for future reuse. Use this after successfully answering a question.',
  parameters: z.object({
    question: z.string().describe('The question text'),
    answer: z.string().describe('The answer provided'),
    context: z.string().optional().describe('Additional context (job title, company, etc.)'),
  }),
  async execute(params, context: AgentContext): Promise<ToolResult> {
    try {
      logger.info('💾 Saving Q&A pair:', { question: params.question });

      await chromaDB.addQAPair({
        id: `qa-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        question: params.question,
        answer: params.answer,
        category: params.context || 'application_form',
        keywords: [params.question.substring(0, 50)],
        usageCount: 1,
        lastUsed: new Date().toISOString(),
      });

      logger.info('Q&A pair saved successfully');

      return {
        success: true,
        result: { saved: true },
      };
    } catch (error) {
      logger.error('Failed to save Q&A pair', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

// Export all tools as registry
export const toolRegistry: Tool[] = [
  navigateTool,
  clickTool,
  typeTool,
  extractTextTool,
  waitTool,
  analyzeTool,
  scrollTool,
  pressKeyTool,
  askHumanTool,
  getUserDataTool,
  matchJobTitleTool,
  matchJobDescriptionTool,
  answerFromResumeTool,
  searchPastQATool,
  saveQAPairTool,
];

// Helper to get tool by name
export function getTool(name: string): Tool | undefined {
  return toolRegistry.find(tool => tool.name === name);
}
