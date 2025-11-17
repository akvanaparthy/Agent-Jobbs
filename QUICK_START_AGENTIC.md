# 🤖 Quick Start: Agentic System

## What Changed?

Your job application system now uses **true AI agents** instead of hardcoded automation:

- ✅ **Vision-based** - Sees the browser like a human
- ✅ **Autonomous** - Makes decisions and adapts
- ✅ **Self-healing** - Recovers from errors automatically
- ✅ **Learning** - Gets smarter over time
- ✅ **Natural language goals** - Just tell it what to do

## Installation

Already done! The system is ready to use.

## Test the New System

```bash
npm run test:agentic
```

This will:
1. Open a browser (visible)
2. Navigate to ZipRecruiter using vision
3. Search for jobs autonomously  
4. Extract job listings
5. Show you memory/learning stats

**Watch the agent think and act in real-time!**

## How to Use

### Simple Tasks (ReAct Agent)

```typescript
import { reactAgent } from './agentic';

// Just tell it what to do in natural language
await reactAgent.executeTask(page, 
  'Log in to ZipRecruiter using the sign-in button'
);

await reactAgent.executeTask(page,
  'Search for software engineer jobs in New York'
);

await reactAgent.executeTask(page,
  'Extract the job title and company from this page'
);
```

### Complex Goals (Task Orchestrator)

```typescript
import { taskOrchestrator } from './agentic';

// Agent breaks down complex goals and executes them
await taskOrchestrator.executeGoal(page,
  'Find and apply to 5 high-paying software engineering jobs in New York'
);
```

The agent will:
1. Navigate to job search
2. Enter search criteria
3. Extract job listings
4. Analyze each for match score
5. Apply to top 5
6. Report results

### Job Extraction

```typescript
import { jobExtractionAgent } from './agentic';

// Extract all visible jobs from current page
const jobs = await jobExtractionAgent.extractJobsFromPage(page);

console.log(`Found ${jobs.length} jobs`);
jobs.forEach(job => {
  console.log(`${job.title} at ${job.company}`);
});
```

## Architecture

```
User Goal ("Apply to 5 jobs")
        ↓
  Task Orchestrator
  (breaks into subtasks)
        ↓
    ReAct Agent
    (for each subtask)
        ↓
   Observe → Think → Act → Reflect
        ↓
  Vision Agent    Tools    Memory
  (sees screen)  (actions) (learns)
```

## Key Features

### 1. Vision-Based (No Selectors!)

**Old way (breaks):**
```typescript
await page.click('button[data-test="sign-in"]');
```

**New way (adapts):**
```typescript
await reactAgent.executeTask(page, 'Click the sign-in button');
```

The agent uses Claude's vision to see and find elements, even after UI redesigns.

### 2. Self-Healing

```typescript
// Old: Crashes on timeout
await page.click('button', { timeout: 5000 }); // ❌ Error

// New: Auto-recovers
await reactAgent.executeTask(page, 'Click the button');
// ✅ Waits longer, tries different approach, or asks for help
```

### 3. Learning & Memory

The agent remembers:
- **Selector cache** - "Email field is usually here"
- **Past strategies** - "This approach worked before"
- **Failure patterns** - "Avoid this, it fails often"

Gets faster and more reliable over time!

### 4. Transparent Reasoning

Watch the agent think:

```
Iteration 1:
  👁️  OBSERVE: I see ZipRecruiter homepage with Sign In button
  💭 THINK: I should click Sign In to start login flow
  ⚡ ACT: click("Sign In button in top right")
  ✅ REFLECT: Success, page changed

Iteration 2:
  👁️  OBSERVE: I see login form with email field
  💭 THINK: I need to enter the email address
  ...
```

## Examples

### Example 1: Autonomous Login

```typescript
import { taskOrchestrator } from './agentic';

await taskOrchestrator.executeGoal(page,
  'Log in to ZipRecruiter with my credentials'
);
```

Agent handles:
- Finding login button (vision)
- Filling email/password (adaptive)
- Handling 2FA/OTP (if needed)
- Waiting for Cloudflare (auto-detects)
- Verifying successful login

### Example 2: Job Search & Apply

```typescript
await taskOrchestrator.executeGoal(page,
  'Find React developer jobs in San Francisco, analyze top 10, and apply to the 3 best matches'
);
```

Agent does:
1. Navigate to job search
2. Enter "React developer" + "San Francisco"
3. Extract 10 jobs
4. Analyze each with AI matcher
5. Rank by score
6. Apply to top 3
7. Track applications

### Example 3: Error Recovery

```typescript
// Cloudflare challenge appears
// Agent automatically:
// 1. Detects challenge visually
// 2. Waits 15 seconds
// 3. Checks if passed
// 4. Continues task

await reactAgent.executeTask(page, 'Navigate to job listings');
// ✅ Handles Cloudflare transparently
```

## Cost & Performance

### Vision API Costs

- ~$0.01-0.05 per screenshot analysis
- With caching: ~90% reduction (reuses selectors)
- **Estimated: $5-20/day for 50-100 applications**

### Speed

- First run: Slower (learns selectors)
- Subsequent runs: **Fast** (uses cached selectors)
- Vision used only when cache fails

## Configuration

Edit `src/agentic/reactAgent.ts`:

```typescript
export class ReActAgent {
  private maxIterations: number = 50; // Adjust if needed
  private model: string = 'claude-3-5-sonnet-20241022'; // Or haiku for cost
}
```

## Debugging

Enable detailed logs:

```typescript
// .env
LOG_LEVEL=debug
```

Watch agent reasoning:
- Logs show each Observe-Think-Act cycle
- Screenshots saved on errors
- Memory stats available

## Migration from Legacy

Old automation is preserved in `src/legacy/` as fallback.

**Hybrid approach (recommended):**

```typescript
// Try agentic first
try {
  await reactAgent.executeTask(page, goal);
} catch (error) {
  // Fallback to legacy hardcoded approach
  await legacyAutomation(page);
}
```

## Troubleshooting

### Agent stuck in loop?
- Check logs for reasoning
- May need to increase `maxIterations`
- Simplify the goal

### Too expensive?
- Use `claude-3-5-haiku` instead of sonnet
- Implement selector caching (already built-in)
- Reduce screenshot frequency

### Vision not accurate?
- Ensure page is fully loaded before screenshots
- Try more specific descriptions
- Increase wait times

## Next Steps

1. **Run the test:** `npm run test:agentic`
2. **Watch it work** - See the agent think and act
3. **Try your own goals** - Modify test script
4. **Check memory stats** - See what it learned
5. **Use in production** - Replace hardcoded automation

## Support

For issues or questions:
- Check `AGENTIC_SYSTEM.md` for detailed docs
- Review `AGENTIC_REDESIGN.md` for architecture
- Enable debug logging
- Watch agent reasoning in real-time

---

**Welcome to truly agentic automation! 🎉**
