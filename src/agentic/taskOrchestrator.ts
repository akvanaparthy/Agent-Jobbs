/**
 * Task Orchestrator - Decomposes high-level goals into subtasks
 */

import Anthropic from '@anthropic-ai/sdk';
import { Page } from 'playwright';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { reactAgent } from './reactAgent';
import { memoryManager } from './memoryManager';

interface Subtask {
  id: number;
  description: string;
  goal: string;
  dependencies: number[];
  estimatedComplexity: 'low' | 'medium' | 'high';
}

interface TaskResult {
  subtask: Subtask;
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
}

export class TaskOrchestrator {
  private client: Anthropic;
  private model: string = 'claude-3-5-haiku-20241022';

  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
  }

  /**
   * Execute a high-level goal by breaking it into subtasks
   */
  async executeGoal(page: Page, goal: string): Promise<{
    success: boolean;
    results: TaskResult[];
    summary: string;
  }> {
    logger.info('🎯 Orchestrating goal:', { goal });

    const startTime = Date.now();

    try {
      // 1. Decompose goal into subtasks
      const subtasks = await this.decomposeGoal(goal);
      logger.info(`📋 Goal decomposed into ${subtasks.length} subtasks`);

      // 2. Execute subtasks in order
      const results: TaskResult[] = [];

      for (const subtask of subtasks) {
        logger.info(`\n📍 Executing subtask ${subtask.id}/${subtasks.length}:`, {
          description: subtask.description,
        });

        const subtaskStartTime = Date.now();

        try {
          // Execute using ReAct agent
          const result = await reactAgent.executeTask(page, subtask.goal);

          const taskResult: TaskResult = {
            subtask,
            success: result.success,
            result: result.result,
            duration: Date.now() - subtaskStartTime,
          };

          results.push(taskResult);

          if (!result.success) {
            logger.warn('⚠️  Subtask failed:', {
              id: subtask.id,
              description: subtask.description,
            });

            // Decide if we should continue
            const shouldContinue = await this.decideContinuation(
              goal,
              subtask,
              taskResult,
              results
            );

            if (!shouldContinue) {
              logger.error('🛑 Stopping execution due to critical failure');
              break;
            }
          } else {
            logger.info('✅ Subtask completed successfully');
          }

        } catch (error) {
          logger.error('❌ Subtask execution error:', { error });

          const taskResult: TaskResult = {
            subtask,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            duration: Date.now() - subtaskStartTime,
          };

          results.push(taskResult);

          // Check if we should continue
          const shouldContinue = await this.decideContinuation(
            goal,
            subtask,
            taskResult,
            results
          );

          if (!shouldContinue) {
            break;
          }
        }
      }

      // 3. Summarize results
      const totalDuration = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;
      const overallSuccess = successCount === subtasks.length;

      const summary = `Completed ${successCount}/${subtasks.length} subtasks in ${Math.round(totalDuration / 1000)}s`;

      logger.info('🏁 Goal execution complete:', {
        success: overallSuccess,
        summary,
      });

      // Record episode
      memoryManager.recordEpisode({
        task: goal,
        success: overallSuccess,
        approach: `Decomposed into ${subtasks.length} subtasks`,
        duration: totalDuration,
        timestamp: Date.now(),
        learnings: results
          .filter(r => !r.success)
          .map(r => `Subtask ${r.subtask.id} failed: ${r.error || 'unknown'}`),
      });

      return {
        success: overallSuccess,
        results,
        summary,
      };

    } catch (error) {
      logger.error('Fatal error in task orchestration:', { error });

      return {
        success: false,
        results: [],
        summary: `Task orchestration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Decompose a high-level goal into specific subtasks
   */
  private async decomposeGoal(goal: string): Promise<Subtask[]> {
    logger.info('🧩 Decomposing goal into subtasks...');

    // Check if we have past successful approaches
    const similarEpisodes = memoryManager.findSimilarEpisodes(goal, 3);

    const pastApproaches = similarEpisodes
      .filter(e => e.success)
      .map(e => `- ${e.approach} (successful)`)
      .join('\n');

    const prompt = `You are a task planning agent. Break down this high-level goal into specific, actionable subtasks.

GOAL: ${goal}

${pastApproaches ? `PAST SUCCESSFUL APPROACHES:\n${pastApproaches}\n` : ''}

GUIDELINES:
- Each subtask should be a single, clear action
- Subtasks should be ordered logically
- Mark dependencies (which subtasks must complete before this one)
- Estimate complexity: low (simple action), medium (multiple steps), high (complex decision-making)
- Be specific about what needs to be accomplished
- Don't assume the current state - include verification steps
- Include error handling and validation steps

EXAMPLES:

Goal: "Apply to 5 software engineering jobs on ZipRecruiter"
Subtasks:
1. Navigate to ZipRecruiter homepage
2. Verify user is authenticated (check for login state)
3. If not authenticated, log in
4. Navigate to job search page
5. Search for "software engineer" jobs
6. Wait for search results to load
7. Extract first 20 job listings
8. For each job: analyze match score
9. Filter jobs with score >= 70%
10. Apply to top 5 matching jobs
11. Track and save application results

Goal: "Log in to ZipRecruiter"
Subtasks:
1. Navigate to ZipRecruiter homepage
2. Find and click the Sign In button
3. Wait for login form to appear
4. Enter email address
5. Click Continue/Next button
6. Wait for password/OTP prompt
7. Handle authentication (password or OTP)
8. Wait for login to complete
9. Verify successful login (check for user profile/dashboard)

Return JSON array of subtasks:
[
  {
    "id": 1,
    "description": "Brief description of what this subtask does",
    "goal": "Specific goal statement for the agent",
    "dependencies": [], // Array of subtask IDs that must complete first
    "estimatedComplexity": "low|medium|high"
  }
]

Return ONLY the JSON array, no markdown code blocks.`;

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
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

    // Parse JSON
    const jsonMatch = response.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.error('Failed to parse subtasks', { response: response.text });
      throw new Error('Failed to decompose goal into subtasks');
    }

    const subtasks: Subtask[] = JSON.parse(jsonMatch[0]);

    logger.info(`✅ Created ${subtasks.length} subtasks`);
    subtasks.forEach((st, i) => {
      logger.debug(`  ${i + 1}. ${st.description} (${st.estimatedComplexity})`);
    });

    return subtasks;
  }

  /**
   * Decide whether to continue after a subtask failure
   */
  private async decideContinuation(
    goal: string,
    failedSubtask: Subtask,
    failedResult: TaskResult,
    allResults: TaskResult[]
  ): Promise<boolean> {
    logger.info('🤔 Deciding whether to continue after failure...');

    const prompt = `A subtask has failed during goal execution. Should we continue?

OVERALL GOAL: ${goal}

FAILED SUBTASK:
- ID: ${failedSubtask.id}
- Description: ${failedSubtask.description}
- Goal: ${failedSubtask.goal}
- Error: ${failedResult.error || 'Unknown error'}

COMPLETED SUBTASKS: ${allResults.filter(r => r.success).length}
FAILED SUBTASKS: ${allResults.filter(r => !r.success).length}

DECISION RULES:
- If the failure is critical to the goal, recommend STOP
- If there are workarounds or the failure is minor, recommend CONTINUE
- If too many failures have occurred, recommend STOP
- If the goal can still be achieved without this subtask, recommend CONTINUE

Return JSON:
{
  "continue": true|false,
  "reasoning": "Explanation of decision"
}`;

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const response = message.content[0];
      if (response.type !== 'text') {
        return false;
      }

      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return false;
      }

      const decision = JSON.parse(jsonMatch[0]);

      logger.info('Decision:', {
        continue: decision.continue,
        reasoning: decision.reasoning,
      });

      return decision.continue;

    } catch (error) {
      logger.error('Failed to decide continuation', { error });
      // Default: stop on failure
      return false;
    }
  }

  /**
   * Get execution statistics
   */
  getStats(): { successRate: number; avgDuration: number; totalExecutions: number } {
    const memoryStats = memoryManager.getStats();

    return {
      successRate: memoryStats.episodes.successRate,
      avgDuration: 0, // TODO: Calculate from episodes
      totalExecutions: memoryStats.episodes.total,
    };
  }
}

// Export singleton
export const taskOrchestrator = new TaskOrchestrator();
