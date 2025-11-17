# 🎯 Smart Answer System - Quick Reference

## Confidence Tiers

| Tier | Confidence | Behavior | Save |
|------|-----------|----------|------|
| ✅ **HIGH** | ≥ 90% | Auto-apply, ask if save | Optional |
| ⚠️ **MEDIUM** | 75-89% | Suggest, wait approval | Always |
| ❓ **LOW** | < 75% | Ask human directly | Always |

## Answer Priority Order

```
1. 💾 ChromaDB Cache     → Instant (if found)
2. 📋 User Profile       → Instant (if matches)
3. 📄 Resume (QA Agent)  → Generate with confidence
4. 🙋 Human Input        → Fallback
```

## Quick Examples

### High Confidence (90%+)
```
✅ Question: "Do you have Python experience?"
   Resume: "5 years of Python development"
   → Auto-applies "Yes"
   → Asks: "Save to memory?" (optional)
```

### Medium Confidence (75-89%)
```
⚠️  Question: "Years of cloud experience?"
   Resume: "Worked with AWS, Azure..."
   → Suggests "3-5 years"
   → Waits for: Approve / Edit / Replace
   → Always saves after approval
```

### Low Confidence (<75%)
```
❓ Question: "Authorized to work in US?"
   Resume: No mention
   → Asks human directly
   → Always saves answer
```

## Files Created

1. **`src/agentic/smartAnswerHandler.ts`**
   - Main smart handler class
   - 3-tier confidence logic
   - ChromaDB integration
   - Profile checking

2. **`src/agentic/tools.ts`** (updated)
   - `answer_from_resume` tool now uses smart handler
   - Automatic confidence routing

## Usage

```typescript
// In agent workflow
const result = await smartAnswerHandler.getAnswer(question, job);

// Result:
{
  answer: "Yes, 5 years",
  confidence: 0.95,
  source: "resume" | "cached" | "profile" | "human",
  saved: true,
  tier: "high" | "medium" | "low"
}
```

## Learning Example

| Application | Time | Human Input | Cached |
|------------|------|-------------|--------|
| #1 | 5 min | 10 questions | 0 |
| #2 | 3 min | 5 questions | 5 |
| #10 | 30 sec | 0 questions | 15 |

**90% time reduction over 10 applications!**

## Setup

```bash
# Setup user profile (one time)
npm run profile:setup

# Process resume (if not done)
npm run resume:process

# Ready to use!
```

## Key Benefits

✅ **Speed**: Cached answers in 0.5 sec  
✅ **Control**: Human oversight when needed  
✅ **Learning**: Smarter with each application  
✅ **Consistency**: Same questions = same answers  
✅ **Safety**: Only auto-applies when confident  

---

For detailed explanation, see **SMART_ANSWER_SYSTEM.md**
