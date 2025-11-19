/**
 * ReActAgent - Implements the Observe-Think-Act-Reflect loop
 */

import Anthropic from '@anthropic-ai/sdk';
import { Page } from 'playwright';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { observationLayer } from './observationLayer';
import { toolRegistry, getTool } from './tools';
import { memoryManager } from './memoryManager';
import { errorRecoveryAgent } from './errorRecoveryAgent';
import { humanInput } from './humanInput';
import {
  AgentContext,
  Thought,
  ToolAction,
  ToolResult,
  AgentMemory,
  MemoryEntry,
  Observation,
} from './types';

export class ReActAgent {
  private client: Anthropic;
  private model: string = 'claude-3-5-haiku-20241022';
  private maxIterations: number = 50;
  private confidenceThreshold: number = 0.5; // Ask human if confidence < 50%

  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
  }

  /**
   * Execute a task using the ReAct loop
   */
  async executeTask(page: Page, goal: string): Promise<{ success: boolean; result?: any }> {
    logger.info('🎯 Starting task execution:', { goal });

    const startTime = Date.now();

    const memory: AgentMemory = {
      recentActions: memoryManager.getRecentActions(),
      selectorCache: new Map(),
      episodes: [],
    };

    let iteration = 0;
    let observation = await observationLayer.observe(page);

    // Check for Cloudflare challenge at start
    if (await errorRecoveryAgent.detectCloudflare(page)) {
      await errorRecoveryAgent.waitForCloudflare(page);
      observation = await observationLayer.observe(page);
    }

    while (iteration < this.maxIterations) {
      iteration++;
      logger.info(`🔄 Iteration ${iteration}/${this.maxIterations}`);

      // Build context
      const context: AgentContext = {
        page,
        memory,
        observation,
        goal,
        iteration,
      };

      // THINK: Reason about what to do next
      const thought = await this.reason(context);

      logger.info('💭 Agent thought:', {
        analysis: thought.analysis,
        goalAchieved: thought.goalAchieved,
        confidence: thought.confidence,
      });

      // Check if goal is achieved
      if (thought.goalAchieved) {
        logger.info('🎉 Goal achieved!', { goal, iterations: iteration });

        // Record successful episode
        const duration = Date.now() - startTime;
        memoryManager.recordEpisode({
          task: goal,
          success: true,
          approach: 'ReAct loop',
          duration,
          timestamp: Date.now(),
          learnings: [`Achieved in ${iteration} iterations`],
        });

        return { success: true, result: thought.analysis };
      }

      // Check if agent is stuck (no action planned)
      if (!thought.nextAction) {
        logger.warn('⚠️  Agent has no next action planned', { thought });
        
        // Ask human for guidance instead of giving up
        console.log('\n🤔 The agent is unsure how to proceed.\n');
        console.log(`Goal: ${goal}`);
        console.log(`Current situation: ${thought.analysis}\n`);
        
        const shouldContinue = await humanInput.confirm(
          'Would you like to provide guidance?',
          true
        );
        
        if (!shouldContinue) {
          return {
            success: false,
            result: 'Agent unable to proceed and user declined to help',
          };
        }
        
        const guidance = await humanInput.askHuman(
          'What should the agent do next? (describe the action)'
        );
        
        // Create a simple action based on guidance
        // For now, we'll use ask_human to get more specific instructions
        thought.nextAction = {
          tool: 'ask_human',
          params: {
            question: 'Please provide more specific instructions on how to proceed',
            context: guidance,
          },
          reasoning: 'Getting human guidance on how to proceed',
        };
        
        logger.info('Human provided guidance', { guidance });
      }
      
      // Check confidence threshold
      if (thought.confidence < this.confidenceThreshold) {
        logger.warn(`⚠️  Low confidence (${Math.round(thought.confidence * 100)}%) on planned action`);
        
        console.log('\n⚠️  LOW CONFIDENCE WARNING\n');
        console.log(`I'm only ${Math.round(thought.confidence * 100)}% confident about this action:\n`);
        console.log(`Action: ${thought.nextAction!.tool}`);
        console.log(`Parameters: ${JSON.stringify(thought.nextAction!.params, null, 2)}`);
        console.log(`Reasoning: ${thought.nextAction!.reasoning}\n`);
        
        const proceed = await humanInput.confirm(
          'Should I proceed with this action?',
          false // Default to no for low confidence
        );
        
        if (!proceed) {
          const alternative = await humanInput.askHuman(
            'What should I do instead? (or type "skip" to skip this action)'
          );
          
          if (alternative.toLowerCase() === 'skip') {
            logger.info('Human asked to skip this iteration');
            continue; // Skip to next iteration
          }
          
          // Use human's alternative guidance
          thought.nextAction = {
            tool: 'ask_human',
            params: {
              question: 'Please provide specific parameters for this action',
              context: alternative,
            },
            reasoning: 'Using human-provided alternative approach',
          };
        }
      }

      // ACT: Execute the planned action
      const actionResult = await this.act(thought.nextAction, context);

      // Store in memory
      const memoryEntry: MemoryEntry = {
        observation,
        thought,
        action: thought.nextAction,
        result: actionResult,
        timestamp: Date.now(),
      };
      memory.recentActions.push(memoryEntry);
      memoryManager.addRecentAction(memoryEntry);

      // Keep only recent memory (last 10 actions)
      if (memory.recentActions.length > 10) {
        memory.recentActions.shift();
      }

      // OBSERVE: Get new observation after action
      await page.waitForTimeout(1000); // Give page time to update
      observation = await observationLayer.observe(page);

      // REFLECT: Check if action was successful
      if (!actionResult.success) {
        logger.warn('❌ Action failed', {
          action: thought.nextAction.tool,
          error: actionResult.error,
        });

        // Attempt error recovery
        const recovery = await errorRecoveryAgent.handleError(
          new Error(actionResult.error || 'Action failed'),
          page,
          { action: thought.nextAction.tool, params: thought.nextAction.params }
        );

        if (recovery.recovered) {
          logger.info('✅ Recovered from error, continuing...');
          observation = await observationLayer.observe(page);
        } else {
          logger.warn('⚠️  Could not recover from error, agent will adapt');
        }
      }
    }

    // Record the episode
    const duration = Date.now() - startTime;
    memoryManager.recordEpisode({
      task: goal,
      success: false,
      approach: 'ReAct loop',
      duration,
      timestamp: Date.now(),
      learnings: ['Maximum iterations reached without achieving goal'],
    });

    logger.error('❌ Max iterations reached without achieving goal', { goal });
    return {
      success: false,
      result: 'Maximum iterations reached',
    };
  }

  /**
   * Reason about the current state and decide next action
   */
  private async reason(context: AgentContext): Promise<Thought> {
    logger.info('🤔 Reasoning...');

    // Build prompt with all context
    const prompt = this.buildReasoningPrompt(context);

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const response = message.content[0];
    if (response.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Parse thought
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('Failed to parse thought', { response: response.text });
      throw new Error('Failed to parse agent thought');
    }

    const thought: Thought = JSON.parse(jsonMatch[0]);
    return thought;
  }

  /**
   * Build the reasoning prompt
   */
  private buildReasoningPrompt(context: AgentContext): string {
    const toolDescriptions = toolRegistry.map(tool => {
      return `- ${tool.name}: ${tool.description}`;
    }).join('\n');

    const recentHistory = context.memory.recentActions
      .slice(-5)
      .map((entry, i) => {
        return `${i + 1}. Action: ${entry.action.tool}(${JSON.stringify(entry.action.params)})
   Result: ${entry.result.success ? '✅ Success' : '❌ Failed - ' + entry.result.error}`;
      })
      .join('\n');

    return `You are an autonomous browser automation agent using the ReAct (Reasoning + Acting) framework.

GOAL: ${context.goal}

CURRENT OBSERVATION:
- URL: ${context.observation.url}
- Page State: ${context.observation.state}
- Description: ${context.observation.description}
- Interactive Elements: ${context.observation.elements?.length || 0} detected

RECENT ACTIONS (last 5):
${recentHistory || 'None yet - this is the first action'}

AVAILABLE TOOLS:
${toolDescriptions}

YOUR TASK:
1. Analyze the current situation
2. Determine if the goal is achieved
3. If not, decide the SINGLE best next action to take
4. Provide your reasoning

RESPONSE FORMAT (JSON only):
{
  "analysis": "Brief analysis of current situation and what you observe",
  "reasoning": "Why you chose this next action (or why goal is achieved)",
  "nextAction": {
    "tool": "tool_name",
    "params": { /* tool parameters */ },
    "reasoning": "Why this specific action with these parameters"
  },
  "goalAchieved": false,
  "confidence": 0.8
}

If goal is achieved, set goalAchieved=true and nextAction=null.

IMPORTANT RULES:
- Return ONLY valid JSON, no markdown code blocks
- Choose ONE action at a time
- Be specific with parameters (e.g., exact text to type, element descriptions)
- If you're stuck or see an error, try a different approach
- For login/auth flows, be patient and wait for pages to load
- If you see a Cloudflare challenge, use the 'wait' tool for 10-15 seconds
- **Use 'get_user_data' tool to get information like phone, address, etc. BEFORE typing into form fields**
- **Use 'ask_human' tool when you need information you don't have or are unsure about an action**
- **If your confidence is below 70%, consider using 'ask_human' for guidance**

Think step-by-step and be methodical.`;
  }

  /**
   * Execute a tool action
   */
  private async act(action: ToolAction, context: AgentContext): Promise<ToolResult> {
    logger.info('⚡ Executing action:', {
      tool: action.tool,
      params: action.params,
    });

    const tool = getTool(action.tool);

    if (!tool) {
      logger.error('Unknown tool requested', { tool: action.tool });
      return {
        success: false,
        error: `Unknown tool: ${action.tool}`,
      };
    }

    try {
      const result = await tool.execute(action.params, context);
      return result;
    } catch (error) {
      logger.error('Tool execution error', { tool: action.tool, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown execution error',
      };
    }
  }
}

// Export singleton
export const reactAgent = new ReActAgent();
