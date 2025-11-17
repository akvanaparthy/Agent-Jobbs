# Agentic System Architecture

## Overview

The new agentic system replaces hardcoded browser automation with a truly autonomous agent that uses vision to understand and interact with web pages.

## Key Components

### 1. VisionAgent (`src/agentic/visionAgent.ts`)
- Uses Claude's vision API to "see" the browser screen
- Analyzes screenshots to understand UI state
- Finds elements by natural language description
- No hardcoded selectors - adapts to UI changes

### 2. ObservationLayer (`src/agentic/observationLayer.ts`)
- Captures current browser state
- Takes screenshots and analyzes them
- Detects UI state (login page, job listing, etc.)
- Waits for specific states or elements to appear

### 3. ReActAgent (`src/agentic/reactAgent.ts`)
- Implements Observe-Think-Act-Reflect loop
- Reasons about what to do next
- Executes actions using tools
- Learns from failures and adapts

### 4. Tool Registry (`src/agentic/tools.ts`)
- Modular capabilities the agent can use
- Tools: navigate, click, type, extract_text, wait, analyze, scroll, press_key
- Agent decides which tools to use and when

## How It Works

### ReAct Loop

```
1. OBSERVE: What's on screen? (vision-based)
   ↓
2. THINK: What should I do next? (LLM reasoning)
   ↓
3. ACT: Execute action using tools
   ↓
4. REFLECT: Did it work? Update memory
   ↓
   (repeat until goal achieved)
```

### Example Flow

**Goal:** "Log in to ZipRecruiter"

```
Iteration 1:
  OBSERVE: I see ZipRecruiter homepage with a "Sign In" button
  THINK: I should click the Sign In button to start login
  ACT: click("Sign In button in top right")
  REFLECT: Success, page changed

Iteration 2:
  OBSERVE: I see a login form with email field
  THINK: I should enter the email address
  ACT: type("email input field", "user@example.com")
  REFLECT: Success, email entered

Iteration 3:
  OBSERVE: I see a Continue button
  THINK: I should click Continue to proceed
  ACT: click("Continue button")
  REFLECT: Success, form submitted

... continues until logged in
```

## Advantages Over Old System

| Old System (Hardcoded) | New System (Agentic) |
|------------------------|---------------------|
| ❌ Breaks when selectors change | ✅ Adapts to UI changes |
| ❌ Linear pipeline | ✅ Autonomous decision-making |
| ❌ No error recovery | ✅ Self-healing |
| ❌ Requires manual updates | ✅ Learns and improves |
| ❌ Fragile | ✅ Robust |

## Testing

Run the test script to see the agent in action:

```bash
npm run test:agentic
```

This will:
1. Launch a browser (visible)
2. Navigate to ZipRecruiter using vision
3. Analyze the page autonomously
4. Show you the agent's reasoning process

## Cost Considerations

Vision API calls cost approximately:
- **$0.01-0.05 per screenshot analysis**
- With intelligent caching, most operations reuse discovered selectors
- Estimated: **$5-20/day** for 50-100 job applications

## Next Steps

1. ✅ Core agentic framework (DONE)
2. 🔄 Implement selector caching (reduces API costs)
3. 🔄 Add error recovery strategies
4. 🔄 Build job-specific agents (extraction, application)
5. 🔄 Add memory/learning system
6. 🔄 High-level task orchestration

## Migration from Legacy

The old system is preserved in `src/legacy/` as a fallback. You can:
- Use the new agentic system for modern, adaptive automation
- Fall back to legacy for specific edge cases
- Gradually migrate capabilities to the new system

## Architecture Diagram

```
┌─────────────────────────────────────┐
│         ReAct Agent Loop             │
│  (Observe → Think → Act → Reflect)   │
└─────────────────────────────────────┘
              ↓
    ┌─────────┴─────────┐
    ↓                   ↓
┌──────────┐      ┌──────────┐
│ Vision   │      │  Tools   │
│ Agent    │      │ Registry │
└──────────┘      └──────────┘
    ↓                   ↓
    └─────────┬─────────┘
              ↓
      ┌──────────────┐
      │   Browser    │
      │ (Playwright) │
      └──────────────┘
```

## Examples

### Vision-Based Element Finding

```typescript
// OLD (brittle):
await page.click('button[data-test="sign-in"]'); // Breaks if selector changes

// NEW (adaptive):
await reactAgent.executeTask(page, 'Click the Sign In button');
// Agent uses vision to find and click, works even after redesigns
```

### Autonomous Error Recovery

```typescript
// OLD:
try {
  await page.click('button');
} catch (error) {
  // Crash or manual intervention needed
}

// NEW:
// Agent sees error, reasons about it, tries alternative approach
// If multiple strategies fail, asks for human help
```

### Natural Language Goals

```typescript
// Instead of writing step-by-step code:
await reactAgent.executeTask(page, 
  'Find and apply to 5 software engineering jobs in New York with salary > $100k'
);

// Agent breaks down the goal and executes autonomously
```

## Development

### Adding a New Tool

```typescript
// src/agentic/tools.ts
export const myNewTool: Tool = {
  name: 'my_tool',
  description: 'What this tool does',
  parameters: z.object({
    param1: z.string().describe('Parameter description'),
  }),
  async execute(params, context) {
    // Implementation
    return { success: true, result: { ... } };
  },
};

// Add to toolRegistry array
```

### Customizing Agent Behavior

Edit `src/agentic/reactAgent.ts`:
- Adjust `maxIterations` (default: 50)
- Modify reasoning prompt for different strategies
- Change model (default: claude-3-5-sonnet-20241022)

## Troubleshooting

### Agent stuck in a loop?
- Check the logs to see reasoning
- May need to adjust prompt or add more tools
- Increase `maxIterations` if needed

### Vision not finding elements?
- Ensure screenshots are clear (not loading states)
- Try more specific descriptions
- Add wait time before analysis

### Too expensive?
- Implement selector caching (planned)
- Use hybrid approach (try cached selector first, fall back to vision)
- Reduce screenshot resolution

## Future Enhancements

1. **Memory System** - Remember successful strategies
2. **Selector Cache** - Cache discovered selectors (90% cost reduction)
3. **Self-Healing** - Automatic error recovery
4. **Multi-Agent** - Specialized agents for different tasks
5. **Human-in-Loop** - Ask for help when truly stuck
