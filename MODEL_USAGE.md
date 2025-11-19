# Claude Model Usage - Haiku Only

## Current Configuration

All Claude AI calls now use **Claude 3.5 Haiku** for cost optimization.

## Model Settings by Component

### 1. Vision Agent (`visionAgent.ts`)
- **Model**: `claude-3-5-haiku-20241022`
- **Usage**: Screenshot analysis, element detection, UI state classification
- **Calls per application**: ~3 calls
- **Cost**: ~$0.01 per application

### 2. ReAct Agent (`reactAgent.ts`)
- **Model**: `claude-3-5-haiku-20241022`
- **Usage**: Autonomous reasoning loop (observe-think-act-reflect)
- **Calls per application**: Varies (5-20 depending on task complexity)
- **Cost**: ~$0.02-0.08 per application

### 3. Task Orchestrator (`taskOrchestrator.ts`)
- **Model**: `claude-3-5-haiku-20241022`
- **Usage**: High-level goal decomposition into subtasks
- **Calls per application**: 1-2 calls
- **Cost**: ~$0.005 per application

### 4. QA Agent (`qaAgent.ts`)
- **Model**: Uses `config.claudeModel`
- **Default**: `claude-3-5-haiku-20241022`
- **Usage**: Answering application questions
- **Calls per application**: 5-15 questions
- **Cost**: ~$0.02-0.06 per application

### 5. Matcher Agent (`matcherAgent.ts`)
- **Model**: Uses `config.claudeModel`
- **Default**: `claude-3-5-haiku-20241022`
- **Usage**: Matching jobs to resume
- **Calls per job**: 2 calls (title + description)
- **Cost**: ~$0.01 per job

### 6. Cover Letter Agent (`coverLetterAgent.ts`)
- **Model**: Uses `config.claudeModel`
- **Default**: `claude-3-5-haiku-20241022`
- **Usage**: Generating cover letters
- **Calls per letter**: 1 call
- **Cost**: ~$0.01 per letter

## Total Cost per Application

**Estimated cost**: $0.05-0.15 per full application

Breakdown:
- Vision analysis: $0.01
- Job matching: $0.01
- Question answering: $0.02-0.06
- ReAct agent (if used): $0.02-0.08

## Configuration

### Default (Haiku)
All agents use Haiku by default. No configuration needed.

### Switch to Sonnet (if needed for better accuracy)
```bash
# In .env file:
CLAUDE_MODEL=claude-3-5-sonnet-20241022
```

**Note**: Only affects agents using `config.claudeModel`:
- QA Agent
- Matcher Agent
- Cover Letter Agent

Vision/ReAct/Orchestrator agents will still use Haiku (hardcoded).

## Cost Comparison

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Vision (per image) |
|-------|---------------------|----------------------|-------------------|
| **Haiku** | $1.00 | $5.00 | $0.40 per 1K images |
| Sonnet | $3.00 | $15.00 | $0.48 per 1K images |
| Opus | $15.00 | $75.00 | N/A |

**Haiku is 3x cheaper than Sonnet** for text, similar for vision.

## When to Use Sonnet

Consider switching to Sonnet if:
- Job matching accuracy is too low
- Question answers have low confidence
- Cover letters need better quality

**Most use cases work perfectly fine with Haiku.**

## Model Performance Notes

### Haiku Strengths:
✅ Fast (2-3x faster than Sonnet)
✅ Cheap (3x cheaper than Sonnet)
✅ Good for structured tasks (matching, Q&A)
✅ Sufficient for vision tasks (element detection)

### Haiku Limitations:
⚠️ Less creative (cover letters may be generic)
⚠️ May miss nuances in job descriptions
⚠️ Lower confidence on complex questions

### When Sonnet is Better:
- Complex reasoning tasks
- Nuanced job matching
- Creative writing (cover letters)
- Low-confidence Q&A scenarios

## Verification

Check current model usage:
```bash
grep -r "model.*claude" src/ --include="*.ts" | grep -v node_modules
```

All should show `claude-3-5-haiku-20241022`.
