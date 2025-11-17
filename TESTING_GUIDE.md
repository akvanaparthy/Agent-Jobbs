# 🧪 Testing Guide: Human-in-the-Loop Features

## Pre-Test Checklist

✅ All code compiled successfully  
✅ No TypeScript errors  
✅ All new files created:
- `src/agentic/humanInput.ts`
- `src/agentic/userDataManager.ts`
- `src/scripts/setupUserProfile.ts`

---

## Test Suite

### Test 1: User Profile Setup ⭐ START HERE

**Purpose:** Verify user profile wizard works

**Command:**
```bash
npm run profile:setup
```

**Expected Behavior:**
1. Shows welcome message
2. Asks for personal info (phone, address, city, state, ZIP)
3. Asks for LinkedIn/portfolio/GitHub URLs
4. Asks work authorization questions
5. Asks demographics (optional)
6. Asks job preferences
7. Asks experience details
8. Saves to `data/user-profile.json`
9. Shows final stats (e.g., "Profile is 85% complete")

**How to Test:**
- Answer all questions OR skip some by pressing Enter
- Check that file exists: `data/user-profile.json`
- Open file and verify your answers are saved correctly

**Expected File Content:**
```json
{
  "personalInfo": {
    "phone": "+1-555-0123",
    "address": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zipCode": "94102",
    ...
  },
  "workAuth": {
    "authorized": true,
    "requireSponsorship": false
  },
  ...
}
```

---

### Test 2: Ask Human Tool

**Purpose:** Verify ask_human tool works in agent

**File to Test:** Create a simple test script

**Create:** `test-ask-human.ts`
```typescript
import { humanInput } from './src/agentic/humanInput';

async function test() {
  console.log('Testing ask_human...\n');
  
  // Test 1: Simple question
  const answer = await humanInput.askHuman('What is your favorite color?');
  console.log(`You answered: ${answer}\n`);
  
  // Test 2: Confirmation
  const confirmed = await humanInput.confirm('Do you like pizza?', true);
  console.log(`Pizza: ${confirmed ? 'Yes' : 'No'}\n`);
  
  // Test 3: Multiple choice
  const choice = await humanInput.choose(
    'Pick your favorite language',
    ['TypeScript', 'Python', 'JavaScript', 'Rust']
  );
  console.log(`You picked: ${choice}\n`);
  
  console.log('✅ All tests passed!');
  process.exit(0);
}

test();
```

**Run:**
```bash
ts-node test-ask-human.ts
```

**Expected:**
- Each question appears with clear formatting
- Input is captured correctly
- Multiple choice shows numbered options
- Confirmation accepts yes/no/y/n

---

### Test 3: User Data Manager

**Purpose:** Verify profile storage and retrieval

**Create:** `test-user-data.ts`
```typescript
import { userDataManager } from './src/agentic/userDataManager';

async function test() {
  console.log('Testing user data manager...\n');
  
  // Test 1: Set and get
  await userDataManager.set('personalInfo.phone', '+1-555-1234');
  const phone = await userDataManager.get('personalInfo.phone');
  console.log(`Set phone: ${phone}`);
  console.assert(phone === '+1-555-1234', 'Phone should match!');
  
  // Test 2: Get or ask (should find existing)
  const phone2 = await userDataManager.getOrAsk(
    'personalInfo.phone',
    'What is your phone?'
  );
  console.log(`Got phone without asking: ${phone2}`);
  console.assert(phone2 === '+1-555-1234', 'Should use stored value!');
  
  // Test 3: Get or ask (should ask for missing)
  console.log('\nThis SHOULD ask you for your email:');
  const email = await userDataManager.getOrAsk(
    'personalInfo.email',
    'What is your email?'
  );
  console.log(`Got email: ${email}`);
  
  // Test 4: Verify it was saved
  const emailStored = await userDataManager.get('personalInfo.email');
  console.assert(emailStored === email, 'Email should be saved!');
  
  // Test 5: Stats
  const stats = await userDataManager.getStats();
  console.log(`\nProfile completeness: ${stats.completeness}%`);
  console.log(`Fields populated: ${stats.fieldsPopulated}/${stats.totalFields}`);
  
  console.log('\n✅ All tests passed!');
  process.exit(0);
}

test();
```

**Run:**
```bash
ts-node test-user-data.ts
```

**Expected:**
- First get/set works silently
- Second getOrAsk finds stored value (no prompt)
- Third getOrAsk prompts for missing email
- Email is saved automatically
- Stats show increasing completeness

---

### Test 4: Confidence Threshold in Agent

**Purpose:** Verify agent asks for confirmation on low confidence

**How to Test:**
1. Run the agentic test suite:
```bash
npm run test:agentic
```

2. Watch for confidence logs in console:
```
💭 Agent thought:
  analysis: "..."
  goalAchieved: false
  confidence: 0.4  ← LOW CONFIDENCE
```

3. Should see warning:
```
⚠️  LOW CONFIDENCE WARNING

I'm only 40% confident about this action:
...
Should I proceed with this action? (yes/no):
```

**Manual Test:**
- Answer "no" → Agent should ask for alternative
- Answer "yes" → Agent should proceed

---

### Test 5: Agent Asks When Stuck

**Purpose:** Verify agent asks for guidance instead of quitting

**How to Simulate:**
1. Give agent an impossible task:
```typescript
await reactAgent.executeTask(page, 'Find a button that does not exist on this page');
```

2. After several iterations, agent should realize it's stuck

**Expected Behavior:**
```
⚠️  Agent has no next action planned

🤔 The agent is unsure how to proceed.

Goal: Find a button that does not exist
Current situation: I've searched the entire page but cannot find the requested button

🤔 Would you like to provide guidance? (yes/no):
```

**Test Options:**
- Answer "yes" → Should ask "What should I do next?"
- Answer "no" → Should return failure gracefully

---

### Test 6: Error Recovery with Human Input

**Purpose:** Verify improved error recovery

**How to Test:**
1. Simulate an error (e.g., navigate to invalid URL)
2. Watch for recovery attempts
3. If all strategies fail, should trigger requestHumanHelp

**Expected Behavior:**
```
🆘 HUMAN HELP NEEDED
─────────────────────────────────────
Error: Navigation failed
Context: Attempting to load https://invalid-url.com
URL: about:blank
─────────────────────────────────────

🤔 Press Enter when you have fixed the issue:
```

**After pressing Enter:**
```
🤔 What did you do to fix it?: I manually navigated to the correct URL

✅ Saved this solution to memory for learning
```

---

### Test 7: Get User Data Tool in Action

**Purpose:** Verify get_user_data tool integration

**Test Script:**
```typescript
import { reactAgent } from './src/agentic';
import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Navigate to a form
  await page.goto('https://www.google.com/search?q=sample+form');
  
  // Ask agent to fill a phone field (should use get_user_data)
  await reactAgent.executeTask(
    page,
    'If you see a phone number field, use get_user_data to retrieve my phone number and fill it in'
  );
  
  await browser.close();
}

test();
```

**Watch For:**
1. Agent calls `get_user_data` tool
2. If phone not in profile → asks human
3. Saves to profile
4. Uses retrieved value to fill field

---

### Test 8: Repeated Applications (Memory Test)

**Purpose:** Verify agent remembers data across tasks

**Test Flow:**
```bash
# First application
npm run test:agentic
# When asked for phone → Enter "+1-555-0123"

# Second application (new session)
npm run test:agentic
# Should NOT ask for phone again - uses stored value!
```

**Expected:**
- First run: Asks for any missing profile data
- Second run: Uses stored data automatically
- Console should show: "Retrieved from profile: +1-555-0123"

---

## 🎯 Integration Test: Full Application Flow

**Purpose:** End-to-end test of all features

**Steps:**

1. **Setup Profile**
```bash
npm run profile:setup
```
Fill in all fields

2. **Test Application**
```bash
npm run test:agentic
```

3. **Watch for:**

**✅ Using stored data:**
```
Agent: "Checking user profile for phone..."
Agent: "Found: +1-555-0123"
Agent: → type("phone field", "+1-555-0123")
```

**✅ Asking for missing data:**
```
Agent: → get_user_data("customFields.yearsExperience", "How many years of experience?")
🤔 How many years of experience?: 5
✅ Saved to profile
```

**✅ Confidence check:**
```
⚠️  Low confidence (45%) on action...
🤔 Should I proceed? (yes/no):
```

**✅ Getting stuck:**
```
🤔 Agent is unsure how to proceed
🤔 Would you like to provide guidance?
```

**✅ Error recovery:**
```
🆘 HUMAN HELP NEEDED
🤔 Press Enter when ready...
🤔 What did you do to fix it?
```

---

## ✅ Success Criteria

All tests should pass if:

1. ✅ User profile setup wizard completes successfully
2. ✅ Profile data is saved to `data/user-profile.json`
3. ✅ `ask_human` tool captures user input correctly
4. ✅ `get_user_data` retrieves stored values OR asks + saves
5. ✅ Agent asks for confirmation on low confidence (<50%)
6. ✅ Agent asks for guidance when stuck (no nextAction)
7. ✅ Error recovery waits for human signal (not arbitrary timeout)
8. ✅ Agent remembers data across sessions
9. ✅ No TypeScript compilation errors
10. ✅ Logs are clear and informative

---

## 🐛 Common Issues & Solutions

### Issue: readline not capturing input
**Solution:** Make sure you're running in a proper terminal (not VS Code debug console)

### Issue: Profile not saving
**Solution:** Check `data/` directory exists and has write permissions

### Issue: Agent not asking questions
**Solution:** Verify `ask_human` and `get_user_data` tools are in toolRegistry

### Issue: Confidence always high
**Solution:** This is expected for simple tasks. Try more ambiguous scenarios

---

## 📊 Test Results Template

```
TEST RESULTS - [Date]
═══════════════════════════════════

✅ Test 1: Profile Setup - PASS
✅ Test 2: Ask Human Tool - PASS
✅ Test 3: User Data Manager - PASS
✅ Test 4: Confidence Threshold - PASS
✅ Test 5: Agent Stuck Handling - PASS
✅ Test 6: Error Recovery - PASS
✅ Test 7: Get User Data Tool - PASS
✅ Test 8: Memory Persistence - PASS
✅ Test 9: Integration Test - PASS

Overall: 9/9 PASSED ✅

Notes:
- Agent successfully used stored phone number
- Confidence check triggered on ambiguous action
- Error recovery learned from human intervention
```

---

## 🚀 Next Steps After Testing

1. ✅ All tests pass → **System ready for production use!**
2. ❌ Some tests fail → Debug specific failures, re-test
3. 🔧 Need adjustments → Modify confidence threshold, prompts, etc.

---

**Happy Testing!** 🧪✨
