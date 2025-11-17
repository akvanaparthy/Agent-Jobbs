# Agent-Jobbs: Agentic Redesign Plan

## Problem Statement

Current system is **scripted automation**, not **agentic AI**:
- Hardcoded selectors break when sites change
- Linear pipeline with no autonomous decision-making
- No error recovery or self-healing
- Agents are just "LLM wrapper functions"

## Vision: True Agentic System

Build an autonomous agent that:
1. **Sees** the browser like a human (vision-based)
2. **Thinks** about what to do next (reasoning loop)
3. **Acts** using appropriate tools (tool calling)
4. **Learns** from successes/failures (memory)
5. **Recovers** from errors autonomously (self-healing)

---

## Phase 1: Vision-Based Browser Agent (Week 1)

### Goal
Replace brittle CSS selectors with vision-based interaction.

### Implementation

#### 1.1 Add Computer Use or Vision API
```bash
npm install @anthropic-ai/sdk
```

#### 1.2 Create VisionAgent
```typescript
// src/agents/visionAgent.ts
export class VisionAgent {
  async describeScreen(screenshot: Buffer): Promise<ScreenDescription> {
    // Use Claude + vision to describe what's on screen
  }
  
  async findElement(screenshot: Buffer, description: string): Promise<Coordinates> {
    // "Find the email input field" → returns {x, y}
  }
  
  async planInteraction(screenshot: Buffer, goal: string): Promise<Action[]> {
    // "Log in to ZipRecruiter" → returns sequence of actions
  }
}
```

#### 1.3 Adaptive Element Finder
```typescript
// src/automation/adaptiveFinder.ts
export class AdaptiveElementFinder {
  async findAndClick(page: Page, description: string) {
    // 1. Try cached selector (fast path)
    const cached = await this.cache.get(description);
    if (cached && await this.elementExists(page, cached)) {
      await page.click(cached);
      return;
    }
    
    // 2. Use vision to find it (slow but reliable)
    const screenshot = await page.screenshot();
    const coords = await visionAgent.findElement(screenshot, description);
    await page.mouse.click(coords.x, coords.y);
    
    // 3. Cache the selector for next time
    const selector = await this.reverseEngineerSelector(page, coords);
    await this.cache.set(description, selector);
  }
}
```

**Benefits:**
- Works even when HTML changes
- Learns selectors over time (fast path)
- Human-like interaction

---

## Phase 2: ReAct Agent Loop (Week 2)

### Goal
Replace linear pipeline with autonomous reasoning loop.

### Implementation

#### 2.1 Core Agent Loop
```typescript
// src/agents/reactAgent.ts
export class ReActAgent {
  async executeTask(goal: string) {
    const maxIterations = 50;
    let iteration = 0;
    
    while (iteration < maxIterations) {
      // OBSERVE: What's happening?
      const observation = await this.observe();
      
      // THINK: What should I do?
      const thought = await this.reason(observation, goal);
      
      if (thought.goalAchieved) {
        return thought.result;
      }
      
      // ACT: Execute action
      const action = thought.nextAction;
      const result = await this.executeTool(action);
      
      // REFLECT: Update memory
      await this.memory.add({
        observation,
        thought,
        action,
        result
      });
      
      iteration++;
    }
    
    throw new Error('Max iterations reached without achieving goal');
  }
  
  async reason(observation: Observation, goal: string): Promise<Thought> {
    const prompt = `
Goal: ${goal}

Current State:
${observation.description}

Recent Actions:
${await this.memory.getRecent(5)}

Think step-by-step:
1. What is the current situation?
2. What needs to happen next to achieve the goal?
3. Which tool should I use?
4. What are the parameters?

Return JSON:
{
  "analysis": "your reasoning",
  "nextAction": {
    "tool": "tool_name",
    "params": {...}
  },
  "goalAchieved": false
}
`;
    
    const response = await this.llm.invoke(prompt);
    return JSON.parse(response);
  }
}
```

#### 2.2 Observation Layer
```typescript
// src/agents/observation.ts
export class ObservationLayer {
  async observe(page: Page): Promise<Observation> {
    const screenshot = await page.screenshot();
    const url = page.url();
    const title = await page.title();
    
    // Get vision description
    const description = await visionAgent.describeScreen(screenshot);
    
    // Detect UI state
    const state = this.detectState(description);
    
    return {
      url,
      title,
      description,
      state, // "login_page", "job_listing", "application_form", etc.
      screenshot,
      timestamp: Date.now()
    };
  }
  
  detectState(description: string): UIState {
    // Use LLM to classify: "This looks like a login page"
    // Or pattern matching for known states
  }
}
```

**Benefits:**
- Agent thinks before acting
- Adapts to unexpected situations
- Transparent reasoning (you can see its thoughts)

---

## Phase 3: Tool-Based Architecture (Week 3)

### Goal
Give agent a toolkit instead of hardcoded functions.

### Implementation

#### 3.1 Tool Registry
```typescript
// src/tools/registry.ts
export const tools = [
  {
    name: "navigate",
    description: "Navigate to a URL",
    parameters: z.object({
      url: z.string().url()
    }),
    async execute({ url }) {
      await page.goto(url);
      return { success: true };
    }
  },
  
  {
    name: "find_and_click",
    description: "Find an element by description and click it",
    parameters: z.object({
      description: z.string()
    }),
    async execute({ description }) {
      await adaptiveFinder.findAndClick(page, description);
      return { success: true };
    }
  },
  
  {
    name: "extract_jobs",
    description: "Extract job listings from current page",
    async execute() {
      const jobs = await jobExtractor.extract(page);
      return { jobs };
    }
  },
  
  {
    name: "analyze_job_match",
    description: "Analyze if a job matches candidate profile",
    parameters: z.object({
      job: JobListingSchema
    }),
    async execute({ job }) {
      const match = await matcherAgent.matchDescription(job);
      return { match };
    }
  },
  
  {
    name: "answer_question",
    description: "Answer an application question using resume",
    parameters: z.object({
      question: z.string()
    }),
    async execute({ question }) {
      const answer = await qaAgent.answerQuestion(question);
      return { answer };
    }
  },
  
  {
    name: "fill_form_field",
    description: "Fill a form field by description",
    parameters: z.object({
      fieldDescription: z.string(),
      value: z.string()
    }),
    async execute({ fieldDescription, value }) {
      const field = await adaptiveFinder.find(page, fieldDescription);
      await field.fill(value);
      return { success: true };
    }
  }
];
```

#### 3.2 Tool Executor
```typescript
// src/agents/toolExecutor.ts
export class ToolExecutor {
  async execute(toolName: string, params: any) {
    const tool = tools.find(t => t.name === toolName);
    
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    
    // Validate params
    if (tool.parameters) {
      tool.parameters.parse(params);
    }
    
    // Execute with error handling
    try {
      const result = await tool.execute(params);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

**Benefits:**
- Agent decides which tools to use
- Easy to add new capabilities
- Structured error handling

---

## Phase 4: Memory & Learning (Week 4)

### Goal
Agent learns from past experiences.

### Implementation

#### 4.1 Episodic Memory
```typescript
// src/memory/episodicMemory.ts
export class EpisodicMemory {
  async store(episode: Episode) {
    await chromaDB.add({
      collection: 'agent_memory',
      documents: [JSON.stringify(episode)],
      metadatas: [{
        task: episode.task,
        success: episode.success,
        timestamp: episode.timestamp
      }]
    });
  }
  
  async recall(task: string): Promise<Episode[]> {
    // Find similar past attempts
    return await chromaDB.query({
      collection: 'agent_memory',
      queryTexts: [task],
      nResults: 5
    });
  }
}
```

#### 4.2 Selector Cache
```typescript
// src/memory/selectorCache.ts
export class SelectorCache {
  private cache = new Map<string, CachedSelector>();
  
  async get(description: string): Promise<string | null> {
    const cached = this.cache.get(description);
    
    if (!cached) return null;
    
    // Check if still valid (decay over time)
    const age = Date.now() - cached.timestamp;
    if (age > 7 * 24 * 60 * 60 * 1000) { // 7 days
      this.cache.delete(description);
      return null;
    }
    
    return cached.selector;
  }
  
  async set(description: string, selector: string) {
    this.cache.set(description, {
      selector,
      timestamp: Date.now(),
      successCount: 1
    });
    
    // Persist to disk
    await this.persist();
  }
}
```

#### 4.3 Strategy Learning
```typescript
// src/agents/strategyLearner.ts
export class StrategyLearner {
  async suggestApproach(task: string): Promise<Strategy> {
    // 1. Check if we've done this before
    const pastAttempts = await memory.recall(task);
    
    if (pastAttempts.length > 0) {
      // Use most successful approach
      const best = pastAttempts.sort((a, b) => 
        b.successRate - a.successRate
      )[0];
      
      return best.strategy;
    }
    
    // 2. Let LLM reason about it
    return await this.llm.invoke(`
      Task: ${task}
      
      Suggest a step-by-step strategy.
    `);
  }
}
```

**Benefits:**
- Gets faster over time (learns selectors)
- Learns from failures
- Suggests proven strategies first

---

## Phase 5: Self-Healing & Recovery (Week 5)

### Goal
Agent recovers from errors autonomously.

### Implementation

#### 5.1 Error Recovery System
```typescript
// src/agents/errorRecovery.ts
export class ErrorRecoveryAgent {
  async handle(error: Error, context: Context): Promise<RecoveryResult> {
    logger.warn('Error detected, attempting recovery', { error });
    
    // 1. Classify error
    const errorType = this.classifyError(error);
    
    // 2. Get recovery strategies
    const strategies = await this.getRecoveryStrategies(errorType, context);
    
    // 3. Try each strategy
    for (const strategy of strategies) {
      try {
        logger.info(`Trying recovery strategy: ${strategy.name}`);
        await strategy.execute();
        logger.info('Recovery successful!');
        return { recovered: true, strategy: strategy.name };
      } catch (retryError) {
        logger.warn(`Strategy ${strategy.name} failed`, { retryError });
        continue;
      }
    }
    
    // 4. Escalate to human
    logger.error('All recovery strategies failed, requesting human help');
    await this.requestHumanIntervention(error, context);
    
    return { recovered: false };
  }
  
  async getRecoveryStrategies(errorType: ErrorType, context: Context): Promise<Strategy[]> {
    const prompt = `
Error Type: ${errorType}
Context: ${JSON.stringify(context)}

Screenshot: ${context.screenshot}

Suggest 3 recovery strategies ranked by likelihood of success.
Examples:
- Reload page
- Clear cookies and retry
- Use alternative selector
- Navigate to homepage and restart
- Wait longer for page to load

Return JSON array of strategies with reasoning.
`;
    
    const response = await this.llm.invoke(prompt);
    return JSON.parse(response);
  }
}
```

#### 5.2 Cloudflare Handler
```typescript
// src/automation/cloudflareHandler.ts
export class CloudflareHandler {
  async detect(page: Page): Promise<boolean> {
    const screenshot = await page.screenshot();
    const description = await visionAgent.describeScreen(screenshot);
    
    return description.includes('Cloudflare') || 
           description.includes('challenge') ||
           description.includes('verify you are human');
  }
  
  async handle(page: Page): Promise<boolean> {
    // 1. Wait for auto-solve
    await page.waitForTimeout(10000);
    
    // 2. Check if passed
    if (!await this.detect(page)) {
      return true; // Success
    }
    
    // 3. Try refreshing
    await page.reload();
    await page.waitForTimeout(10000);
    
    if (!await this.detect(page)) {
      return true;
    }
    
    // 4. Request human help
    logger.warn('Cloudflare challenge detected, requesting human intervention');
    await this.notifyHuman('Please solve Cloudflare challenge');
    
    // Wait for human to solve
    while (await this.detect(page)) {
      await page.waitForTimeout(5000);
    }
    
    return true;
  }
}
```

**Benefits:**
- Handles unexpected errors gracefully
- Multiple recovery strategies
- Learns which recoveries work
- Human-in-the-loop for complex cases

---

## Phase 6: High-Level Task Orchestration (Week 6)

### Goal
Single command to accomplish complex goals.

### Implementation

#### 6.1 Task Decomposition
```typescript
// src/agents/taskOrchestrator.ts
export class TaskOrchestrator {
  async executeGoal(goal: string) {
    // 1. Decompose into subtasks
    const subtasks = await this.decompose(goal);
    
    // 2. Execute each subtask with agent
    const results = [];
    
    for (const subtask of subtasks) {
      const result = await this.reactAgent.executeTask(subtask);
      results.push(result);
      
      // Check if we should continue
      if (!result.success) {
        const shouldContinue = await this.decideContinuation(
          goal,
          subtask,
          result,
          results
        );
        
        if (!shouldContinue) {
          break;
        }
      }
    }
    
    return {
      goal,
      results,
      success: results.every(r => r.success)
    };
  }
  
  async decompose(goal: string): Promise<Subtask[]> {
    const prompt = `
Goal: ${goal}

Break this down into specific, actionable subtasks.

Example goal: "Apply to 5 suitable software engineering jobs on ZipRecruiter"

Subtasks:
1. Navigate to ZipRecruiter
2. Ensure authenticated
3. Search for "software engineer" jobs
4. Extract first 20 job listings
5. Analyze each job for match score
6. Filter jobs with score >= 70
7. For each suitable job (up to 5):
   a. Navigate to job application page
   b. Extract application questions
   c. Answer each question using resume
   d. Review answers with user
   e. Submit application
8. Export results to Excel

Return JSON array of subtasks.
`;
    
    const response = await this.llm.invoke(prompt);
    return JSON.parse(response);
  }
}
```

#### 6.2 Example Usage
```typescript
// User runs:
npm run apply

// System executes:
const orchestrator = new TaskOrchestrator();
await orchestrator.executeGoal(
  "Apply to 5 high-match software engineering jobs on ZipRecruiter today"
);

// Agent:
// 1. Thinks: "I need to authenticate first"
// 2. Checks session → invalid
// 3. Thinks: "I'll log in using visual approach"
// 4. Finds login button, clicks it
// 5. Sees email field, fills it
// 6. ... continues autonomously
// 7. Applies to jobs
// 8. Reports results
```

**Benefits:**
- Natural language goals
- Autonomous execution
- Adaptive to site changes
- Transparent progress

---

## Migration Strategy

### Step 1: Keep Current System Running
Don't break existing functionality while migrating.

### Step 2: Build New Agent Alongside
```
src/
├── agents/              # OLD: Keep existing
│   ├── matcherAgent.ts
│   └── qaAgent.ts
├── agentic/             # NEW: Build here
│   ├── visionAgent.ts
│   ├── reactAgent.ts
│   ├── toolExecutor.ts
│   └── errorRecovery.ts
```

### Step 3: Gradual Replacement
1. Week 1-2: Build vision agent, test on login flow
2. Week 3-4: Add ReAct loop, test on job extraction
3. Week 5-6: Add memory & recovery
4. Week 7: Full integration
5. Week 8: Deprecate old system

### Step 4: Comparison Testing
Run both systems in parallel, compare:
- Success rate
- Speed
- Error handling
- Adaptability to site changes

---

## Success Metrics

### Current System
- ❌ Breaks when selectors change
- ❌ Manual intervention required for errors
- ❌ Linear flow, no adaptation
- ❌ No learning over time

### Agentic System
- ✅ Adapts to UI changes (vision-based)
- ✅ Self-heals from errors
- ✅ Autonomous decision-making
- ✅ Learns and improves
- ✅ Transparent reasoning
- ✅ Natural language goals

---

## Quick Wins (Do These First)

### 1. Vision-Based Login (3 days)
Replace auth setup with vision agent.
- No more hardcoded selectors
- Works even if ZipRecruiter redesigns

### 2. Adaptive Element Finder (2 days)
Add fallback to vision when selectors fail.
- Current system tries hardcoded selector
- If fails → use vision
- Cache discovered selector

### 3. Error Recovery for Cloudflare (1 day)
Auto-detect and handle Cloudflare challenges.
- Detect via vision
- Wait or refresh
- Request human help if needed

These 3 changes alone would make the system **10x more reliable**.

---

## Cost Considerations

### Vision API Calls
- Claude Computer Use: ~$0.01-0.05 per interaction
- GPT-4V: ~$0.01 per image

### Optimization
- Cache selectors (reduce vision calls by 90%)
- Use vision only when hardcoded fails (hybrid approach)
- Batch screenshot analysis

**Estimate:** $5-20/day for 50-100 job applications with vision fallback.

---

## Timeline Summary

| Week | Focus | Deliverable |
|------|-------|-------------|
| 1 | Vision Agent | Visual login, element finding |
| 2 | ReAct Loop | Autonomous reasoning system |
| 3 | Tool System | Modular capabilities |
| 4 | Memory | Learning from past runs |
| 5 | Recovery | Self-healing errors |
| 6 | Orchestration | High-level goals |

**Total:** 6 weeks to truly agentic system.

---

## Next Steps

1. **Review this plan** - Does this align with your vision?
2. **Choose starting point** - Quick wins vs. full rebuild?
3. **Set up vision API** - Anthropic Computer Use or GPT-4V
4. **Build VisionAgent** - First milestone
5. **Test on login flow** - Prove the concept

Ready to start?
