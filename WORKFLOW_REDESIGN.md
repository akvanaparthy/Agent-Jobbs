# ZipRecruiter 1-Click Apply - Workflow Redesign Plan

## Current State Analysis

### API Flow Discovered:
1. **Click "1-Click Apply"**
   - `GET /apply/api/v2/interview?listing_key={key}&placement_id={id}`
   - Returns: Interview questions JSON (if any)

2. **Modal Opens** (if questions exist)
   - Selector: `[role="dialog"].ApplyFlowApp.interview_v2`
   - All questions in single modal (no DOM navigation)

3. **Submit Answers**
   - `POST /apply/api/v2/interview?listing_key={key}&group=1&placement_id={id}`
   - Body: Form data with answers
   - Response: 200 (success)

4. **Success Indicators**
   - Modal closes
   - Button text changes: "1-Click Apply" → "Applied {job_title}"

### Questions Found (from tracking):
- `desired_salary`
- `address`, `address_city`, `address_state`, `address_zip`
- `linkedin_url`
- `date_available`
- `website_url`

### ✅ DISCOVERED (see API_FLOW_DISCOVERED.md for full details):
- **Multi-step flow**: YES - POST response contains `questionAnswerGroup` with next questions
- **Question structure**: JSON with `id`, `type` (textField/select/info), `text`, `required`, `options`
- **Completion detection**: `status: "REVIEW"` + NO `questionAnswerGroup` in response
- **Question types**: `textField` (inputs), `select` (dropdowns), `info` (display only)
- **Answer format**: Always arrays - `{"id": "...", "answer": ["value"]}`
- **Info questions**: Must include in POST with empty string `answer: [""]`

### Still Unknown:
- **No-question applications**: Flow for instant apply (not captured in monitoring)
- **Character limits**: Whether API enforces maxLength or just UI validation
- **Error responses**: Structure of error payloads (400/404/500)

---

## Proposed Architecture

### Mode Configuration

```typescript
enum ApplicationMode {
  SCRAPE_ONLY = 'scrape',           // Fetch jobs, match, save to Excel
  INTERACTIVE_APPLY = 'interactive'  // Fetch, match, apply interactively
}
```

### Mode 1: SCRAPE ONLY (Current Behavior)
1. Fetch all jobs from ZipRecruiter
2. Send to Claude for matching
3. Save all results to Excel
4. Done

### Mode 2: INTERACTIVE APPLY (New)

```
1. Fetch all jobs
2. Match with Claude → Filter by score ≥ 60%
3. Sort by match score (highest first)
4. For each high-scoring job:

   A. Check if "1-Click Apply" button exists

   B. IF YES (Easy Apply):
      i.   Click "1-Click Apply"
      ii.  GET /apply/api/v2/interview
      iii. Parse questions from API response
      iv.  For each question:
           - Check ChromaDB for cached answer (fuzzy match)
           - If not cached:
             * Send question + context to Claude
             * Get answer with confidence score
             * IF confidence ≥ 65%: Auto-approve
             * ELSE: Show to user for approval/edit
           - Cache approved answer to ChromaDB
      v.   POST answers to /apply/api/v2/interview?group=N
      vi.  IF response contains more questions: GOTO iv
      vii. ELSE: Application complete
      viii. Save to applied.xlsx

   C. IF NO (Manual Apply Required):
      i.   Click into job page for full description
      ii.  Match with Claude (use full description)
      iii. IF score ≥ 60%:
           - Generate cover letter (no hallucinations)
           - Save to manual_apply.xlsx
      iv.  ELSE: Skip job

   D. IF ERROR during apply:
      i.   Log error details
      ii.  Save to failed_apply.xlsx
      iii. Continue to next job
```

---

## Critical Design Decisions

### 1. Auto-Approve Threshold
- **Confidence ≥ 65%**: Auto-approve and fill
- **Confidence < 65%**: Require user approval
- **Rationale**: Balance between speed and quality control

### 2. Question Matching (ChromaDB)
- Use fuzzy matching for cached questions
- Examples:
  - "LinkedIn URL" matches "Linkedin Profile"
  - "Desired Salary" matches "Expected Salary Range"
- **Implementation**: Use embeddings similarity > 0.85

### 3. Failed Applications
- Save to `failed_apply.xlsx` with columns:
  - Job Title, Company, URL
  - Error Message, Timestamp
  - Last Successful Step
- **Rationale**: Debug and potentially retry later

### 4. Manual Jobs Flow
- Click into job page to get FULL description
- Better matching accuracy than snippet
- Generate tailored cover letter
- Save to separate Excel for manual submission

### 5. System Prompt Constraints
**Critical Rule**: No hallucinations allowed
```
- Use ONLY experiences from provided resume
- Do NOT invent projects, skills, or work history
- If information not available, respond "Unable to answer from resume"
- Flag questions that require information not in resume
```

---

## Data Models

### Excel Outputs

**applied.xlsx**
```
- Job Title
- Company
- Location
- Job URL
- Match Score
- Application Date
- Questions Asked (JSON)
- Answers Provided (JSON)
- Status (Applied/Failed)
```

**manual_apply.xlsx**
```
- Job Title
- Company
- Location
- Job URL
- Match Score
- Job Description (full)
- Cover Letter (generated)
- Why Manual (e.g., "No 1-Click Apply")
```

**failed_apply.xlsx**
```
- Job Title
- Company
- Job URL
- Match Score
- Error Message
- Last Successful Step
- Timestamp
- Full Error Stack
```

---

## Multi-Step Dialog Handling

### ✅ VERIFIED - Actual Flow:

```typescript
// Step 1: GET initial questions
GET /apply/api/v2/interview?listing_key=X&placement_id=44071
Response: {
  totalGroups: 2,             // Total number of question groups
  totalQuestions: 14,
  group: 1,                   // Current group
  status: "SCREENING_QUESTIONS",
  questionAnswerGroup: {
    questions: [...]          // Group 1 questions
  }
}

// Step 2: POST group 1 answers
POST /apply/api/v2/interview?listing_key=X&group=1&placement_id=44071
Body: { answer_holders: [{answers: [...]}] }
Response: {
  totalGroups: 2,
  group: 2,                   // Next group number
  status: "SCREENING_QUESTIONS",  // Still more questions
  questionAnswerGroup: {      // More questions!
    questions: [...]          // Group 2 questions
  }
}

// Step 3: POST group 2 answers
POST /apply/api/v2/interview?listing_key=X&group=2&placement_id=44071
Body: { answer_holders: [{answers: [...]}] }
Response: {
  totalGroups: 2,
  status: "REVIEW",           // Application complete!
  // NO questionAnswerGroup field
}

// Detection logic:
function hasMoreQuestions(response) {
  return response.status === "SCREENING_QUESTIONS" &&
         response.hasOwnProperty('questionAnswerGroup');
}

function isComplete(response) {
  return response.status === "REVIEW";
}
```

---

## Implementation Phases

### Phase 1: API Discovery ✅ COMPLETE
- [x] Create enhanced monitoring script
- [x] Capture full request/response bodies
- [x] User applies to multiple jobs manually:
  - Jobs with single-group questions (5-6 questions)
  - Jobs with multi-group questions (14 questions, 2 groups)
- [x] Analyze JSON structure
- [x] Document multi-step flow
- [x] Created comprehensive documentation (API_FLOW_DISCOVERED.md)

### Phase 2: Core Refactoring ✅ COMPLETE
- [x] Add mode configuration to .env (APPLICATION_MODE, AUTO_APPROVE_CONFIDENCE, MIN_APPLY_SCORE)
- [x] Refactor main entry point for mode selection (src/index.ts)
- [x] Create mode-specific flows (src/modes/scrapeMode.ts, src/modes/interactiveMode.ts)
- [x] Create `InteractiveApplicationFlow` class (src/flows/interactiveApplicationFlow.ts)
- [x] Implement API-based question parser (src/services/questionParser.ts)
- [x] Build multi-step dialog handler (InterviewAPIClient.completeInterview())
- [x] Update config schema and types

### Phase 3: Question Answering System ✅ COMPLETE
- [x] ChromaDB already has Q&A pairs with fuzzy matching (distance < 0.3)
- [x] Fuzzy question matching implemented (searchSimilarQuestions)
- [x] Claude integration exists in QAAgent
- [x] Confidence scoring implemented (0-1 scale, 0.6 threshold)
- [x] User approval CLI interface created (src/cli/userApproval.ts)
- [x] Integrated approval into InteractiveApplicationFlow with auto-approve logic

### Phase 4: Application Logic ✅ COMPLETE
- [x] Detect "1-Click Apply" buttons (findApplyButton in InteractiveApplicationFlow)
- [x] Handle button click + modal wait (applyToJob method)
- [x] Parse API responses (QuestionParser.parseResponse)
- [x] Fill form fields - NOT NEEDED (API-based flow handles directly)
- [x] Handle submission + verification (submitAnswers + isApplicationComplete)
- [x] Store and use listingKey from job data (added to JobListing)

### Phase 5: Error Handling & Outputs ✅ COMPLETE
- [x] Try-catch around each job application (already in interactiveMode)
- [x] Failed application logging (failedJobs array)
- [x] Excel export utilities created (src/utils/multiExcelExport.ts):
  - exportAppliedJobs() - Applied jobs with Q&A details
  - exportFailedJobs() - Failed applications with errors
  - exportManualJobs() - Manual apply jobs with cover letters (ready for future use)
- [x] Cover letter generation agent (src/agents/coverLetterAgent.ts) with no-hallucination constraint
- [x] Integrated exports into interactiveMode

### Phase 6: Testing & Refinement ✅ IN PROGRESS
- [x] Fixed button detection - removed navigation to job pages
- [x] Fixed answer formatting - AI now returns clean values only
- [x] Added phone number validation (+1XXXXXXXXXX format)
- [x] Confirmed info questions handled correctly (empty string)
- [ ] Test with various job types
- [ ] Validate no hallucinations in answers
- [ ] Rate limiting (if needed)
- [ ] User acceptance testing

**Recent Fixes (2025-11-15):**
1. **Button Detection**: Removed page navigation before clicking apply - button exists on search results page only
2. **Answer Cleaning**: Added cleanAnswer() method to strip explanations and extract pure values
3. **Phone Format**: Auto-detect phone questions and format as +1XXXXXXXXXX (digits only)
4. **Prompt Updates**: Changed from "max 200 words" to "ONLY the value, no explanations"

---

## Open Technical Questions

1. **API Response Structure**: What exact JSON does GET/POST return?
2. **Multi-step Detection**: How to know there are more questions?
3. **No-question Flow**: What happens when job has zero questions?
4. **Success Confirmation**: What indicates successful submission?
5. **Field Types**: Are there selects, radios, checkboxes, or just text?
6. **Character Limits**: Do fields have max length? (check during monitoring)
7. **Required Fields**: How to detect which fields are mandatory?

---

## Next Immediate Steps

1. ✅ Save this plan to `WORKFLOW_REDESIGN.md`
2. ⏳ Create enhanced monitoring script with request/response body logging
3. ⏳ User applies to jobs while monitoring runs
4. ⏳ Analyze captured API data
5. ⏳ Update this document with findings
6. ⏳ Begin implementation

---

## Risk Mitigation

### Anti-Bot Detection
- **Risk**: ZipRecruiter detects automation
- **Mitigation**:
  - Use persistent browser profile (already doing)
  - Add random delays between actions
  - Limit applications per session (e.g., max 20)
  - Monitor for CAPTCHAs

### Data Integrity
- **Risk**: Hallucinated answers get submitted
- **Requirement**: Strict system prompt enforcement
- **Validation**: User review for confidence < 65%
- **Audit**: Log all answers for manual review

### Application Failures
- **Risk**: Mid-flow errors leave jobs in unknown state
- **Mitigation**:
  - Comprehensive error logging
  - Save state before each step
  - Failed jobs Excel for retry

---

## Success Metrics

- **Speed**: Apply to 20 jobs in < 30 minutes (vs manual: 2+ hours)
- **Accuracy**: Match score ≥ 70% for applied jobs
- **Quality**: Zero hallucinated information in submissions
- **Coverage**: Successfully handle 90%+ of 1-Click Apply jobs
- **User Effort**: ≤ 5 manual interventions per 20 applications

---

*Last Updated: 2025-11-15*
*Status: Phase 5 Complete - Ready for Phase 6 (Testing & Refinement)*
