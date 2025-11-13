# Agent-Jobbs: Implementation Plan

## Project Overview

**Goal**: Semi-automated job application system for ZipRecruiter that finds 1-Click Apply jobs, matches them to your resume, prepares answers to application questions, and lets you review/submit manually.

**Tech Stack**:
- **Framework**: LangChain + LangGraph
- **Browser Automation**: Playwright + playwright-extra-stealth
- **Vector Database**: ChromaDB
- **LLM**: Claude Haiku 3/3.5 via @langchain/anthropic
- **Language**: TypeScript/Node.js
- **Approach**: Semi-automated (AI prepares, user submits)
- **Authentication**: Manual login once, save session

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    LangGraph Orchestrator                    │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
    ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
    │ Job Finder   │ │   Matcher   │ │   Q&A Agent  │
    │    Agent     │ │    Agent    │ │              │
    └──────────────┘ └─────────────┘ └──────────────┘
            │               │               │
            └───────────────┼───────────────┘
                            ▼
                ┌───────────────────────┐
                │  Browser Automation   │
                │   (Playwright)        │
                └───────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
    ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
    │  ChromaDB    │ │ Job Storage │ │ User Review  │
    │ (Resume+Q&A) │ │   (JSON)    │ │ Interface    │
    └──────────────┘ └─────────────┘ └──────────────┘
```

---

## Phase 1: Project Setup & Authentication (Week 1)

### 1.1 Project Initialization

- [ ] Initialize TypeScript project with `npm init` and configure `tsconfig.json`
- [ ] Install core dependencies:
  ```bash
  npm install langchain @langchain/anthropic @langchain/community
  npm install langgraph @langchain/langgraph
  npm install playwright playwright-extra puppeteer-extra-plugin-stealth
  npm install chromadb chromadb-client
  npm install dotenv zod
  npm install -D @types/node typescript ts-node nodemon
  npm install -D eslint prettier @typescript-eslint/eslint-plugin
  ```
- [ ] Set up ESLint and Prettier configurations
- [ ] Create `.gitignore` file (include `node_modules/`, `.env`, `data/sessions/`, `data/jobs/`)

### 1.2 Directory Structure

- [ ] Create project structure:
  ```
  agent-jobbs/
  ├── src/
  │   ├── agents/          # Individual specialized agents
  │   │   ├── jobFinderAgent.ts
  │   │   ├── matcherAgent.ts
  │   │   ├── qaAgent.ts
  │   │   └── index.ts
  │   ├── workflows/       # LangGraph workflow definitions
  │   │   ├── jobApplicationWorkflow.ts
  │   │   └── index.ts
  │   ├── automation/      # Browser automation
  │   │   ├── browser.ts
  │   │   ├── zipRecruiterNav.ts
  │   │   ├── jobParser.ts
  │   │   ├── questionDetector.ts
  │   │   ├── stealth.ts
  │   │   └── sessionManager.ts
  │   ├── storage/         # Data persistence
  │   │   ├── chromaDB.ts
  │   │   ├── jobStorage.ts
  │   │   ├── resumeProcessor.ts
  │   │   └── applicationTracker.ts
  │   ├── config/          # Configuration management
  │   │   ├── config.ts
  │   │   ├── rateLimiter.ts
  │   │   └── constants.ts
  │   ├── utils/           # Helpers
  │   │   ├── logger.ts
  │   │   ├── delays.ts
  │   │   ├── humanBehavior.ts
  │   │   └── validators.ts
  │   ├── types/           # TypeScript types
  │   │   └── index.ts
  │   └── index.ts         # Main entry point
  ├── data/
  │   ├── resume/          # Resume files (PDF/DOCX/TXT)
  │   ├── sessions/        # Browser session data
  │   ├── jobs/            # Job listings (JSON)
  │   └── applications/    # Applied jobs tracking
  ├── tests/               # Test files
  ├── docs/                # Additional documentation
  ├── .env.example
  ├── .env
  ├── .gitignore
  ├── package.json
  ├── tsconfig.json
  └── README.md
  ```

### 1.3 Configuration System

- [ ] Create `.env.example` template with:
  ```
  # API Keys
  ANTHROPIC_API_KEY=your_api_key_here

  # Job Search Configuration
  SEARCH_KEYWORDS=software engineer,developer
  SEARCH_LOCATION=San Francisco, CA

  # Matching Thresholds
  TITLE_MATCH_THRESHOLD=0.6
  DESCRIPTION_MATCH_THRESHOLD=0.7

  # Filters
  DATE_FILTER=past_week  # past_day, past_week, past_month

  # Rate Limiting
  MAX_APPLICATIONS_PER_DAY=30
  MIN_DELAY_BETWEEN_APPS_MS=480000  # 8 minutes
  MAX_DELAY_BETWEEN_APPS_MS=1200000 # 20 minutes

  # Operating Hours (24-hour format)
  OPERATION_START_HOUR=9
  OPERATION_END_HOUR=18

  # Mode
  DRY_RUN=true  # Set to false for actual applications

  # ChromaDB
  CHROMA_DB_PATH=./data/chromadb
  ```
- [ ] Create `src/config/config.ts` to load and validate environment variables
- [ ] Implement Zod schemas for configuration validation
- [ ] Add configuration export with type safety

### 1.4 Browser Automation Setup

- [ ] Install Playwright browsers: `npx playwright install`
- [ ] Create `src/automation/browser.ts`:
  - [ ] Initialize Playwright with stealth plugin
  - [ ] Configure browser context with anti-detection headers
  - [ ] Set up user agent rotation
  - [ ] Configure viewport and device emulation
- [ ] Create `src/automation/stealth.ts`:
  - [ ] Human-like typing function (random delays per character)
  - [ ] Mouse movement simulation
  - [ ] Random scrolling behavior
  - [ ] Click with slight position offset
  - [ ] Random pauses between actions
- [ ] Create `src/automation/sessionManager.ts`:
  - [ ] Save browser cookies after login
  - [ ] Save localStorage data
  - [ ] Load session from saved data
  - [ ] Validate session is still active
  - [ ] Handle session expiration

### 1.5 Manual Login Flow

- [ ] Create `src/automation/auth.ts`:
  - [ ] Launch browser in non-headless mode
  - [ ] Navigate to ZipRecruiter login page
  - [ ] Wait for user to manually log in
  - [ ] Detect successful login (check for profile elements)
  - [ ] Save session to `data/sessions/ziprecruiter-session.json`
  - [ ] Display success message to user
- [ ] Create script: `npm run auth:setup` to run manual login
- [ ] Test session persistence across multiple runs

### 1.6 Logging & Error Handling

- [ ] Set up Winston or Pino logger in `src/utils/logger.ts`
- [ ] Configure log levels (debug, info, warn, error)
- [ ] Log to console and file (`logs/app.log`)
- [ ] Create error classes for different failure types
- [ ] Implement retry logic with exponential backoff
- [ ] Add CAPTCHA detection handler (pause execution, alert user)

---

## Phase 2: Job Discovery & Data Collection (Week 2)

### 2.1 Job Search Navigation

- [ ] Create `src/automation/zipRecruiterNav.ts`:
  - [ ] Navigate to ZipRecruiter search page
  - [ ] Fill in job keywords input field (with human-like typing)
  - [ ] Fill in location input field
  - [ ] Apply date filter from dropdown
  - [ ] Click search button
  - [ ] Wait for results to load
  - [ ] Handle "no results" scenario
- [ ] Implement pagination:
  - [ ] Detect "Next" button or page numbers
  - [ ] Navigate through multiple pages
  - [ ] Track current page number
  - [ ] Stop at last page or max page limit

### 2.2 Job Listing Parser

- [ ] Create `src/automation/jobParser.ts`:
  - [ ] Extract job card elements from listing page
  - [ ] For each job card, extract:
    - [ ] Job title
    - [ ] Company name
    - [ ] Location
    - [ ] Salary range (if available)
    - [ ] Posted date/time
    - [ ] Job URL
    - [ ] **Detect "1-Click Apply" button presence**
  - [ ] Click into job detail page
  - [ ] Extract full job description
  - [ ] Extract job requirements (if in structured format)
  - [ ] Extract benefits/perks
  - [ ] Take screenshot of job posting (for debugging)
- [ ] Create TypeScript interface for job data:
  ```typescript
  interface JobListing {
    id: string;
    title: string;
    company: string;
    location: string;
    salary?: string;
    postedDate: string;
    url: string;
    description: string;
    requirements?: string[];
    benefits?: string[];
    hasOneClickApply: boolean;
    scrapedAt: string;
  }
  ```
- [ ] Filter jobs to only keep those with `hasOneClickApply: true`

### 2.3 Job Storage

- [ ] Create `src/storage/jobStorage.ts`:
  - [ ] Save job listings to JSON files in `data/jobs/`
  - [ ] File naming: `jobs-{date}-{timestamp}.json`
  - [ ] Implement deduplication (don't save same job twice)
  - [ ] Create index file for quick lookup
  - [ ] Add functions: `saveJobs()`, `loadJobs()`, `getJobById()`
- [ ] Implement job cache to avoid re-processing

### 2.4 ChromaDB Setup

- [ ] Install ChromaDB:
  - [ ] Option A: Run locally with `docker run -p 8000:8000 chromadb/chroma`
  - [ ] Option B: Use ChromaDB in-process (Python backend via HTTP)
- [ ] Create `src/storage/chromaDB.ts`:
  - [ ] Initialize ChromaDB client
  - [ ] Create collection: `resume_embeddings`
    - [ ] Configure embedding function (Claude or sentence-transformers)
    - [ ] Set up metadata schema
  - [ ] Create collection: `qa_pairs`
    - [ ] Configure same embedding function
    - [ ] Set up Q&A metadata schema
  - [ ] Implement functions:
    - [ ] `addResumeChunks(chunks: ResumeChunk[])`
    - [ ] `searchResumeChunks(query: string, limit: number)`
    - [ ] `addQAPair(question: string, answer: string, metadata: object)`
    - [ ] `searchSimilarQuestions(question: string, limit: number)`

### 2.5 Resume Processing

- [ ] Create `src/storage/resumeProcessor.ts`:
  - [ ] Support multiple formats: PDF, DOCX, TXT
  - [ ] Install parsers: `pdf-parse`, `mammoth` (for DOCX)
  - [ ] Extract text from resume file
  - [ ] Chunk resume by sections:
    - [ ] Work Experience (per job entry)
    - [ ] Skills (categorize if possible)
    - [ ] Education (per degree)
    - [ ] Projects (per project)
    - [ ] Summary/Objective
  - [ ] Create metadata for each chunk:
    ```typescript
    interface ResumeChunk {
      id: string;
      text: string;
      section: 'experience' | 'skills' | 'education' | 'projects' | 'summary';
      metadata: {
        company?: string;
        role?: string;
        dateRange?: string;
        technologies?: string[];
        // ... other relevant fields
      };
    }
    ```
  - [ ] Generate embeddings for each chunk
  - [ ] Store in ChromaDB
- [ ] Create script: `npm run resume:process` to process and store resume
- [ ] Verify resume chunks are searchable

---

## Phase 3: Job Matching System (Week 3)

### 3.1 Title Matching Agent

- [ ] Create `src/agents/matcherAgent.ts`:
  - [ ] Implement `matchTitle(jobTitle: string, resumeProfile: string)`:
    - [ ] Use Claude to compare job title with candidate's role/skills
    - [ ] Prompt: "Given this job title '{jobTitle}' and candidate profile '{profile}', rate the match from 0.0 to 1.0"
    - [ ] Return match score + reasoning
  - [ ] Use configurable threshold from config (e.g., 0.6)
  - [ ] Log reasoning for later review
- [ ] Test with various job titles (relevant and irrelevant)

### 3.2 Job Description Analyzer

- [ ] Implement `matchDescription(job: JobListing, resumeChunks: ResumeChunk[])`:
  - [ ] Retrieve relevant resume chunks from ChromaDB (semantic search)
  - [ ] Use Claude to analyze:
    - [ ] Compare job requirements with resume experience
    - [ ] Check for must-have skills
    - [ ] Check for nice-to-have skills
    - [ ] Check experience level match (years, seniority)
    - [ ] Identify gaps (skills candidate doesn't have)
  - [ ] Generate detailed match report:
    ```typescript
    interface MatchReport {
      overallScore: number;
      titleMatch: number;
      skillsMatch: number;
      experienceMatch: number;
      reasoning: string;
      matchedSkills: string[];
      missingSkills: string[];
      strengths: string[];
      concerns: string[];
    }
    ```
  - [ ] Use configurable threshold (e.g., 0.7) for proceeding
- [ ] Save match report with job data

### 3.3 LangGraph Workflow

- [ ] Create `src/workflows/jobApplicationWorkflow.ts`:
  - [ ] Define workflow states:
    ```typescript
    interface WorkflowState {
      jobs: JobListing[];
      currentJobIndex: number;
      matchedJobs: JobWithMatch[];
      rejectedJobs: JobWithReason[];
      preparedApplications: PreparedApplication[];
    }
    ```
  - [ ] Define workflow nodes:
    - [ ] `fetchJobs`: Get jobs from storage or scrape new ones
    - [ ] `titleMatch`: Check title match for current job
    - [ ] `fullMatch`: Full description analysis
    - [ ] `prepareApplication`: Generate answers (Phase 4)
    - [ ] `saveResults`: Persist matched/rejected jobs
  - [ ] Define edges/transitions:
    ```
    START → fetchJobs → titleMatch
    titleMatch → [low score: reject] → nextJob
    titleMatch → [high score: fullMatch] → fullMatch
    fullMatch → [low score: reject] → nextJob
    fullMatch → [high score: prepareApplication] → prepareApplication
    prepareApplication → nextJob → titleMatch (loop)
    nextJob → [more jobs: titleMatch] → [no jobs: END]
    ```
  - [ ] Implement checkpoint system (save state after each job)
  - [ ] Handle interruptions (can resume later)
- [ ] Test workflow with sample jobs

### 3.4 Early Exit Optimization

- [ ] Implement title match as first filter (cheap, fast)
- [ ] Only do expensive full analysis if title matches
- [ ] Track API usage and costs
- [ ] Log skipped jobs with reasons

---

## Phase 4: Application Preparation (Week 4)

### 4.1 Question Detection

- [ ] Create `src/automation/questionDetector.ts`:
  - [ ] Navigate to job detail page
  - [ ] Click "1-Click Apply" button
  - [ ] Wait for popup/modal to appear
  - [ ] Detect form elements:
    - [ ] Text inputs (`<input type="text">`, `<textarea>`)
    - [ ] Dropdowns (`<select>`)
    - [ ] Checkboxes (`<input type="checkbox">`)
    - [ ] Radio buttons (`<input type="radio">`)
  - [ ] Extract question data:
    ```typescript
    interface ApplicationQuestion {
      id: string;
      type: 'text' | 'textarea' | 'select' | 'checkbox' | 'radio';
      label: string;
      required: boolean;
      options?: string[];  // For select/radio
      placeholder?: string;
      defaultValue?: string;
    }
    ```
  - [ ] Handle multi-step forms (detect "Next" button, process all steps)
  - [ ] Take screenshot of each question form
  - [ ] Close popup without submitting

### 4.2 Question Answering Agent

- [ ] Create `src/agents/qaAgent.ts`:
  - [ ] Implement `answerQuestion(question: ApplicationQuestion, context: AnswerContext)`:
    - [ ] `context` includes: job description, resume chunks, past Q&A pairs
    - [ ] First: Search ChromaDB for similar past questions
    - [ ] If found (similarity > 0.9): Use cached answer
    - [ ] If not found: Generate answer with Claude:
      - [ ] For text/textarea: Generate detailed response
      - [ ] For select/radio: Choose best option from available choices
      - [ ] For checkbox: Determine yes/no based on context
    - [ ] Return generated answer + confidence score (0-1)
  - [ ] Special handling for common questions:
    - [ ] "Are you authorized to work in [country]?"
    - [ ] "Years of experience with [technology]"
    - [ ] "Expected salary range"
    - [ ] "When can you start?"
  - [ ] Flag questions that need user input:
    - [ ] Very specific personal questions
    - [ ] Legal/compliance checkboxes
    - [ ] Salary expectations (if not in config)
    - [ ] Availability dates
    - [ ] Confidence score < 0.6

### 4.3 Q&A Memory System

- [ ] Implement `storeQAPair(question, answer, metadata)`:
  - [ ] Generate embedding for question
  - [ ] Store in ChromaDB `qa_pairs` collection
  - [ ] Include metadata: job title, category, date, confidence
- [ ] Implement `updateQAPair(questionId, newAnswer)`:
  - [ ] Allow user to correct AI-generated answers
  - [ ] Update ChromaDB entry
  - [ ] Increment "usage count" for popular Q&As
- [ ] Create Q&A export function (for user review)

### 4.4 Application Package Assembly

- [ ] Create `src/types/index.ts` interfaces:
  ```typescript
  interface PreparedApplication {
    job: JobListing;
    matchReport: MatchReport;
    questions: ApplicationQuestion[];
    answers: {
      questionId: string;
      answer: string;
      confidence: number;
      source: 'cached' | 'generated' | 'user_input_required';
    }[];
    needsReview: boolean;  // True if any answer has low confidence
    coverLetter?: string;  // Optional
    createdAt: string;
  }
  ```
- [ ] Implement `assemblePreparedApplication()`:
  - [ ] Combine job, match report, questions, answers
  - [ ] Flag for review if needed
  - [ ] Save to `data/applications/prepared/`
  - [ ] Generate unique ID for tracking

---

## Phase 5: User Review Interface (Week 5)

### 5.1 CLI Interface

- [ ] Install CLI libraries: `inquirer`, `chalk`, `cli-table3`
- [ ] Create `src/cli/reviewInterface.ts`:
  - [ ] Display prepared applications one by one:
    - [ ] Job title, company, location (in color)
    - [ ] Match score with visual indicator (progress bar)
    - [ ] List of matched skills vs missing skills
    - [ ] Show all questions with prepared answers
    - [ ] Highlight low-confidence answers in yellow/red
  - [ ] User options menu:
    ```
    What would you like to do?
    > Apply (opens browser with pre-filled form)
    > Edit Answers
    > Skip Job
    > Save for Later
    > View Full Job Description
    > Quit
    ```
  - [ ] For "Edit Answers":
    - [ ] Show each question with current answer
    - [ ] Allow inline editing
    - [ ] Save updated answers to ChromaDB
    - [ ] Update confidence to 1.0 (user-verified)
  - [ ] For "Skip Job":
    - [ ] Ask for reason (optional)
    - [ ] Move job to rejected list
  - [ ] For "Save for Later":
    - [ ] Add to bookmarked jobs list

### 5.2 Browser Pre-Fill & Semi-Automation

- [ ] Create `src/automation/applicationSubmitter.ts`:
  - [ ] `preFillApplication(job: JobListing, answers: Answer[])`:
    - [ ] Open browser with saved session
    - [ ] Navigate to job detail page
    - [ ] Click "1-Click Apply" button
    - [ ] Wait for form to load
    - [ ] For each question/answer pair:
      - [ ] Find form element by label/ID
      - [ ] Fill in answer with human-like typing
      - [ ] For dropdowns: select option
      - [ ] For checkboxes: check/uncheck
      - [ ] Add random delay between fields (2-5 seconds)
    - [ ] Scroll to submit button
    - [ ] **Highlight submit button but DON'T click**
    - [ ] Display message: "Review the form and click 'Submit' when ready"
    - [ ] Wait for user to manually click submit
  - [ ] Detect submission result:
    - [ ] Success: Look for confirmation message or "Applied" badge
    - [ ] Failure: Look for error messages
    - [ ] Return result status

### 5.3 Application Tracking

- [ ] Create `src/storage/applicationTracker.ts`:
  - [ ] `recordApplication(job, answers, status)`:
    - [ ] Save to `data/applications/applied/applied-{date}.json`
    - [ ] Fields to track:
      ```typescript
      interface AppliedJob {
        id: string;
        jobId: string;
        title: string;
        company: string;
        url: string;
        appliedDate: string;
        appliedTime: string;
        questions: ApplicationQuestion[];
        answers: Answer[];
        matchScore: number;
        salary?: string;
        status: 'applied' | 'interview' | 'rejected' | 'offer' | 'withdrawn';
        notes: string;
      }
      ```
  - [ ] `updateApplicationStatus(applicationId, newStatus, notes)`:
    - [ ] Allow manual status updates from CLI
  - [ ] `getApplicationStats()`:
    - [ ] Total applications
    - [ ] Applications by date
    - [ ] Average match score
    - [ ] Status breakdown
  - [ ] Export functions:
    - [ ] Export to CSV
    - [ ] Export to JSON
    - [ ] (Optional) Export to Google Sheets

### 5.4 Daily Tracking & Limits

- [ ] Implement rate limiter in `src/config/rateLimiter.ts`:
  - [ ] Track application count per day
  - [ ] Enforce max applications per day (30)
  - [ ] Track time between applications
  - [ ] Enforce minimum delay (8 minutes)
  - [ ] Add random delay (8-20 minutes)
  - [ ] Only operate during configured hours (9 AM - 6 PM)
  - [ ] Pause outside operating hours
- [ ] Display daily stats in CLI:
  ```
  Today's Progress:
  ✓ Applied: 12 / 30
  ⏱ Next application available in: 14 minutes
  📊 Average match score: 0.78
  ```

---

## Phase 6: Testing & Refinement (Week 6)

### 6.1 Dry-Run Mode

- [ ] Create `DRY_RUN` flag in config (default: true)
- [ ] When enabled:
  - [ ] Execute full workflow (find, match, prepare answers)
  - [ ] Show what would be submitted
  - [ ] **Do NOT open browser or interact with forms**
  - [ ] Log all actions that would be taken
  - [ ] Display prepared applications in CLI
  - [ ] Allow user to review without actually applying
- [ ] Create detailed dry-run report:
  ```
  Dry Run Summary:
  ├─ Jobs found: 45
  ├─ 1-Click Apply jobs: 23
  ├─ Title match passed: 18
  ├─ Full match passed: 12
  ├─ Applications prepared: 12
  └─ Would apply to: 12 jobs
  ```

### 6.2 Testing Checklist

- [ ] **Authentication Tests:**
  - [ ] Manual login saves session correctly
  - [ ] Session persists across restarts
  - [ ] Session validation detects expired sessions
  - [ ] Re-authentication flow works when needed
- [ ] **Job Discovery Tests:**
  - [ ] Search with different keywords/locations
  - [ ] Pagination works for multiple pages
  - [ ] 1-Click Apply detection is accurate
  - [ ] Job parser extracts all fields correctly
  - [ ] Duplicate jobs are filtered
- [ ] **Matching Tests:**
  - [ ] Title matching scores are reasonable
  - [ ] Full description matching is accurate
  - [ ] Match reports are detailed and helpful
  - [ ] Thresholds work as expected (filter correctly)
- [ ] **Question Answering Tests:**
  - [ ] Question detection finds all form fields
  - [ ] Similar questions retrieve cached answers
  - [ ] New questions generate relevant answers
  - [ ] Low-confidence answers are flagged
  - [ ] User can edit and save answers
- [ ] **Browser Automation Tests:**
  - [ ] Stealth measures avoid detection (no 403s)
  - [ ] Human-like typing looks natural
  - [ ] Form pre-filling works for all input types
  - [ ] User can submit manually
  - [ ] Success/failure detection works
- [ ] **Storage Tests:**
  - [ ] ChromaDB stores and retrieves embeddings
  - [ ] Job data persists correctly
  - [ ] Application tracking records all fields
  - [ ] Data exports work (CSV, JSON)
- [ ] **Rate Limiting Tests:**
  - [ ] Daily limit enforcement (stops at 30)
  - [ ] Delays between applications (8-20 min)
  - [ ] Operating hours respected
  - [ ] Stats tracking is accurate
- [ ] **Error Handling Tests:**
  - [ ] Network failures are retried
  - [ ] CAPTCHA detection pauses execution
  - [ ] Invalid sessions trigger re-authentication
  - [ ] Malformed job pages don't crash app
  - [ ] All errors are logged

### 6.3 Rate Limiting & Safety Validation

- [ ] Monitor for anti-bot detection:
  - [ ] Check for 403 Forbidden responses
  - [ ] Check for CAPTCHA challenges
  - [ ] Check for account warnings
  - [ ] Check for IP blocks
- [ ] Validate human-like behavior:
  - [ ] Timing varies (not robotic)
  - [ ] Mouse movements look natural
  - [ ] Typing speed is realistic
  - [ ] Scrolling patterns are believable
- [ ] Test conservative rate limiting:
  - [ ] Run for 3-5 days with 20-30 apps/day
  - [ ] Monitor for any account issues
  - [ ] Adjust delays if needed

### 6.4 Performance Optimization

- [ ] Profile application performance:
  - [ ] Time each workflow step
  - [ ] Identify bottlenecks
  - [ ] Optimize slow operations
- [ ] Reduce API costs:
  - [ ] Use Claude Haiku for simple tasks
  - [ ] Cache repeated operations
  - [ ] Batch embedding generation
- [ ] Improve matching accuracy:
  - [ ] Review match reports for false positives/negatives
  - [ ] Adjust thresholds based on results
  - [ ] Refine prompts for better scoring

---

## Phase 7: Future Enhancements (Optional)

### 7.1 Google Sheets Integration

- [ ] Install Google Sheets API client: `npm install googleapis`
- [ ] Set up Google Cloud Project and enable Sheets API
- [ ] Create service account and download credentials
- [ ] Implement `src/integrations/googleSheets.ts`:
  - [ ] Authenticate with Google Sheets
  - [ ] Create spreadsheet for job tracking
  - [ ] Sheet 1: Applied Jobs (all fields from AppliedJob)
  - [ ] Sheet 2: Prepared Applications (pending review)
  - [ ] Sheet 3: Non-1-Click Jobs (saved for later)
  - [ ] Sheet 4: Statistics (charts, summaries)
  - [ ] Functions:
    - [ ] `syncAppliedJobs()`: Export applied jobs to sheet
    - [ ] `syncPreparedJobs()`: Export prepared apps
    - [ ] `updateJobStatus()`: Update status from CLI to sheet
    - [ ] `generateStats()`: Create charts and summaries
- [ ] Add real-time sync after each application
- [ ] Create shareable link for tracking

### 7.2 Non-1-Click Job Saving

- [ ] For jobs without 1-Click Apply:
  - [ ] Still run matching process
  - [ ] If match score is high (>0.8):
    - [ ] Save job details
    - [ ] Generate tailored cover letter using Claude
    - [ ] Extract resume keywords relevant to job
    - [ ] Create customized resume bullets (optional)
    - [ ] Save to `data/jobs/manual-apply/`
    - [ ] Export to separate Google Sheets tab
  - [ ] Fields to save:
    ```typescript
    interface ManualApplyJob {
      job: JobListing;
      matchScore: number;
      coverLetter: string;
      tailoredResumeBullets?: string[];
      savedDate: string;
      appliedManually?: boolean;
      appliedDate?: string;
    }
    ```
- [ ] Add CLI command to view saved manual jobs
- [ ] Allow marking as "applied manually"

### 7.3 Multi-Job Board Support

- [ ] Abstract browser automation:
  - [ ] Create interface: `JobBoardNavigator`
    ```typescript
    interface JobBoardNavigator {
      search(keywords: string, location: string): Promise<void>;
      parseJobListing(element: Element): JobListing;
      detectOneClickApply(job: JobListing): boolean;
      detectQuestions(): Promise<ApplicationQuestion[]>;
      preFillForm(answers: Answer[]): Promise<void>;
    }
    ```
  - [ ] Implement `ZipRecruiterNavigator`
  - [ ] Implement `IndeedNavigator`
  - [ ] Implement `LinkedInNavigator`
- [ ] Unified job storage (tag by source)
- [ ] Unified tracking across platforms
- [ ] Allow user to select which boards to search

### 7.4 Web UI (React/Next.js)

- [ ] Create new Next.js project in `/ui` directory
- [ ] Set up API routes to communicate with backend
- [ ] Dashboard pages:
  - [ ] **Home Dashboard:**
    - [ ] Today's stats (applications, success rate)
    - [ ] Progress bars (daily limit)
    - [ ] Recent applications timeline
  - [ ] **Job Queue:**
    - [ ] List of prepared applications
    - [ ] Filter by match score, date, company
    - [ ] Quick review & apply buttons
  - [ ] **Application History:**
    - [ ] Searchable table of all applications
    - [ ] Status filters (applied, interview, rejected, etc.)
    - [ ] Edit status and add notes
    - [ ] Export functionality
  - [ ] **Q&A Database:**
    - [ ] Browse all questions and answers
    - [ ] Edit answers
    - [ ] Tag and categorize
    - [ ] Search by keyword
  - [ ] **Configuration:**
    - [ ] Edit job search parameters
    - [ ] Adjust match thresholds
    - [ ] Set rate limits
    - [ ] Upload/update resume
  - [ ] **Statistics:**
    - [ ] Charts: applications over time
    - [ ] Match score distribution
    - [ ] Success rate by company/job title
    - [ ] Time saved vs manual application
- [ ] Real-time updates (WebSocket or polling)
- [ ] Responsive design for mobile
- [ ] Dark mode support

### 7.5 Advanced Features

- [ ] **AI Resume Tailoring:**
  - [ ] For each job, generate custom resume bullets
  - [ ] Emphasize relevant experience
  - [ ] Adjust skills section
  - [ ] Generate multiple resume versions
- [ ] **Follow-Up Automation:**
  - [ ] Track application dates
  - [ ] Send follow-up reminders (email, not automated)
  - [ ] Suggest follow-up message templates
- [ ] **Interview Preparation:**
  - [ ] Generate likely interview questions based on job
  - [ ] Prepare answers using resume context
  - [ ] Create STAR method responses
- [ ] **Salary Negotiation:**
  - [ ] Research salary ranges for job titles
  - [ ] Suggest negotiation strategies
  - [ ] Track offers and counter-offers

---

## Success Metrics

### MVP Goals (End of Phase 6)

- [ ] Find and filter 1-Click Apply jobs from ZipRecruiter
- [ ] Match jobs to resume with 70%+ accuracy
- [ ] Generate relevant answers to application questions
- [ ] Allow user to review and submit applications manually
- [ ] Track 20-30 applications per day without account bans
- [ ] Save 90% of time compared to manual application

### KPIs to Track

- [ ] **Efficiency:**
  - [ ] Time per application (target: 2-3 minutes)
  - [ ] Applications per day (target: 20-30)
  - [ ] Time saved vs manual (target: 90%)
- [ ] **Quality:**
  - [ ] Match score accuracy (user feedback)
  - [ ] Answer relevance (user edits <10%)
  - [ ] Interview rate (compare to manual applications)
- [ ] **Safety:**
  - [ ] Account ban rate (target: 0%)
  - [ ] CAPTCHA encounters (target: <5%)
  - [ ] 403 errors (target: 0%)

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1 | Week 1 | Project setup, authentication, browser automation |
| Phase 2 | Week 2 | Job discovery, parsing, ChromaDB, resume processing |
| Phase 3 | Week 3 | Job matching system, LangGraph workflow |
| Phase 4 | Week 4 | Question answering, application preparation |
| Phase 5 | Week 5 | CLI interface, browser pre-fill, tracking |
| Phase 6 | Week 6 | Testing, dry-run mode, validation |
| Phase 7 | Week 7+ | Optional enhancements (Sheets, UI, etc.) |

**Total MVP Time: 6 weeks**

---

## Risk Mitigation

### High-Risk Items

1. **Account Ban Risk:**
   - Mitigation: Conservative rate limiting, stealth measures, semi-automated approach
   - Fallback: Create new account, use different job boards
2. **Question Answering Accuracy:**
   - Mitigation: User review before submission, learn from corrections
   - Fallback: Flag low-confidence answers, require user input
3. **Browser Automation Detection:**
   - Mitigation: playwright-extra-stealth, human-like behavior simulation
   - Fallback: Manual application with AI-generated materials
4. **API Costs (Claude):**
   - Mitigation: Use Haiku, cache aggressively, optimize prompts
   - Fallback: Reduce match depth, batch operations

### Contingency Plans

- [ ] If account banned: Wait 30 days, create new account, reduce rate
- [ ] If CAPTCHA appears: Pause automation, alert user, manual solve
- [ ] If API costs too high: Switch to cheaper model, reduce calls
- [ ] If matching inaccurate: Adjust prompts, collect user feedback, retrain

---

## Next Steps (After Plan Approval)

1. [ ] Review and approve this plan
2. [ ] Set up development environment
3. [ ] Create GitHub repository (if not already exists)
4. [ ] Initialize project with Phase 1.1 tasks
5. [ ] Install dependencies
6. [ ] Begin browser automation setup
7. [ ] Schedule regular check-ins to track progress

---

## Resources & References

### Documentation
- [LangChain JS Docs](https://js.langchain.com/)
- [LangGraph Docs](https://langchain-ai.github.io/langgraphjs/)
- [Playwright Docs](https://playwright.dev/)
- [ChromaDB Docs](https://docs.trychroma.com/)
- [Anthropic Claude API](https://docs.anthropic.com/)

### Tools
- [playwright-extra](https://github.com/berstend/puppeteer-extra/tree/master/packages/playwright-extra)
- [playwright-extra-plugin-stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)

### Best Practices
- Web scraping ethics and legality
- Anti-bot detection avoidance
- Job application best practices
- Resume optimization

---

**Last Updated:** 2025-11-13

**Status:** ✅ Plan approved, ready for implementation

**Current Phase:** Phase 1 - Project Setup
