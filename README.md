# Agent-Jobbs

An intelligent, semi-automated job application system powered by AI. Agent-Jobbs finds jobs on ZipRecruiter that match your resume, prepares application answers using Claude AI, and presents them for your review before submission.

## Features

- 🤖 **AI-Powered Matching**: Uses Claude 3.5 to match jobs with your resume
- 🔍 **Smart Job Discovery**: Finds 1-Click Apply jobs automatically
- 📝 **Intelligent Q&A**: Answers application questions using your resume and past answers
- 🎯 **High Accuracy**: Only applies to jobs with good match scores
- 🔒 **Semi-Automated**: You review and submit manually (ToS compliant)
- 🛡️ **Stealth Mode**: Anti-detection measures to avoid account bans
- 📊 **Application Tracking**: Tracks all applications with detailed analytics
- 💾 **Memory System**: Learns from past Q&A to improve future answers

## Architecture

```
┌─────────────────────────────────────────┐
│         Agent-Jobbs System              │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────┐  ┌──────────┐           │
│  │ Browser  │  │ ChromaDB │           │
│  │ Automat  │  │ Vector   │           │
│  │ ion      │  │ Store    │           │
│  └──────────┘  └──────────┘           │
│       │              │                 │
│       ▼              ▼                 │
│  ┌─────────────────────────┐          │
│  │   Claude AI Agents      │          │
│  │  - Matcher Agent        │          │
│  │  - Q&A Agent            │          │
│  └─────────────────────────┘          │
│               │                        │
│               ▼                        │
│  ┌─────────────────────────┐          │
│  │   Application Tracker   │          │
│  └─────────────────────────┘          │
│                                        │
└────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** 18+
- **TypeScript** 4.5+
- **ChromaDB** (for vector storage)
- **Anthropic API Key** (for Claude AI)
- **ZipRecruiter Account** (for job applications)

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd agent-jobbs
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

```env
# API Keys
ANTHROPIC_API_KEY=your_api_key_here

# Job Search Configuration
SEARCH_KEYWORDS=software engineer,developer,full stack
SEARCH_LOCATION=San Francisco, CA

# Matching Thresholds (0-1 scale)
TITLE_MATCH_THRESHOLD=0.6
DESCRIPTION_MATCH_THRESHOLD=0.7

# Filters
DATE_FILTER=past_week

# Rate Limiting
MAX_APPLICATIONS_PER_DAY=30
MIN_DELAY_BETWEEN_APPS_MS=480000  # 8 minutes
MAX_DELAY_BETWEEN_APPS_MS=1200000 # 20 minutes

# Mode
DRY_RUN=true  # Set to false for actual applications
```

### 4. Set Up ChromaDB

**Option A: Docker (Recommended)**

```bash
docker run -p 8000:8000 chromadb/chroma
```

**Option B: Local Installation**

```bash
pip install chromadb
chroma run --path ./data/chromadb
```

### 5. Build the Project

```bash
npm run build
```

## Usage

### Step 1: Set Up Authentication

Run the profile-based authentication setup:

```bash
npm run auth:profile
```

This will:
1. Open a browser with persistent profile (data/browser-profile/)
2. Wait for you to log in manually to ZipRecruiter
3. Your session is automatically saved in the browser profile
4. Login persists indefinitely - no need to re-run this!

### Step 2: Process Your Resume

Add your resume to the `data/resume/` directory (PDF, DOCX, or TXT format), then run:

```bash
npm run resume:process
```

This will:
1. Parse your resume
2. Chunk it into sections
3. Generate embeddings
4. Store in ChromaDB for matching

### Step 3: Run the Job Finder

Start the job finding and matching process:

```bash
npm start
```

Or use development mode with hot-reload:

```bash
npm run dev
```

The system will:
1. Search for jobs on ZipRecruiter
2. Filter for 1-Click Apply jobs
3. Match jobs against your resume
4. Prepare application answers
5. Present them for your review

## Configuration

### Job Search Settings

- **SEARCH_KEYWORDS**: Comma-separated list of job titles/keywords
- **SEARCH_LOCATION**: City, State or ZIP code
- **DATE_FILTER**: `past_day`, `past_week`, `past_month`, or `any_time`

### Matching Thresholds

- **TITLE_MATCH_THRESHOLD**: 0.0-1.0 (default: 0.6)
  - How well job title must match your profile
- **DESCRIPTION_MATCH_THRESHOLD**: 0.0-1.0 (default: 0.7)
  - Overall job description match score required

### Rate Limiting

- **MAX_APPLICATIONS_PER_DAY**: Maximum applications per day (default: 30)
- **MIN_DELAY_BETWEEN_APPS_MS**: Minimum delay between applications (default: 8 minutes)
- **MAX_DELAY_BETWEEN_APPS_MS**: Maximum delay between applications (default: 20 minutes)
- **OPERATION_START_HOUR**: Hour to start operations (default: 9 AM)
- **OPERATION_END_HOUR**: Hour to stop operations (default: 6 PM)

### Safety Features

- **DRY_RUN**: When `true`, no actual applications are submitted
- **HEADLESS**: Run browser in headless mode (default: false)
- **Stealth Mode**: Always enabled (anti-detection measures)

## Project Structure

```
agent-jobbs/
├── src/
│   ├── agents/              # AI agents
│   │   ├── matcherAgent.ts  # Job matching
│   │   └── qaAgent.ts       # Question answering
│   ├── automation/          # Browser automation
│   │   ├── browser.ts       # Browser manager
│   │   ├── stealth.ts       # Anti-detection
│   │   ├── sessionManager.ts
│   │   ├── zipRecruiterNav.ts
│   │   ├── jobParser.ts
│   │   └── questionDetector.ts
│   ├── storage/             # Data persistence
│   │   ├── chromaDB.ts      # Vector database
│   │   ├── jobStorage.ts    # Job listings
│   │   ├── resumeProcessor.ts
│   │   └── applicationTracker.ts
│   ├── config/              # Configuration
│   │   ├── config.ts        # Main config
│   │   ├── constants.ts     # Constants
│   │   └── rateLimiter.ts   # Rate limiting
│   ├── utils/               # Utilities
│   │   ├── logger.ts        # Logging
│   │   ├── delays.ts        # Timing utilities
│   │   └── humanBehavior.ts # Human-like automation
│   ├── types/               # TypeScript types
│   │   └── index.ts
│   ├── scripts/             # Utility scripts
│   │   ├── setupAuth.ts     # Authentication setup
│   │   └── processResume.ts # Resume processing
│   └── index.ts             # Main entry point
├── data/
│   ├── resume/              # Your resume files
│   ├── sessions/            # Browser sessions
│   ├── jobs/                # Scraped job listings
│   ├── applications/        # Application tracking
│   └── chromadb/            # Vector database
├── logs/                    # Application logs
├── .env                     # Environment configuration
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

### 1. Job Discovery

- Searches ZipRecruiter with your keywords
- Filters for 1-Click Apply jobs
- Parses job details (title, company, description, requirements)

### 2. Job Matching

**Title Matching:**
- Compares job title with your resume
- Scores 0.0-1.0 based on relevance
- Quick filter to skip obviously bad matches

**Full Description Matching:**
- Analyzes complete job description
- Compares with all resume sections
- Provides detailed match report:
  - Overall score
  - Skills match
  - Experience match
  - Matched/missing skills
  - Strengths and concerns

### 3. Question Answering

**Detection:**
- Detects all form fields (text, dropdown, checkbox, radio)
- Extracts labels and options
- Identifies required vs optional

**Answering:**
1. **Search Cache**: Looks for similar past questions in ChromaDB
2. **Generate Answer**: If not cached, uses Claude with resume context
3. **Confidence Scoring**: Assigns confidence level (0-1)
4. **Save for Future**: Stores good answers for reuse

**Answer Sources:**
- `cached`: Used a previous answer
- `generated`: AI-generated from resume
- `user_input_required`: Low confidence, needs review

### 4. Application Preparation

- Compiles all information:
  - Job details
  - Match report
  - Questions with prepared answers
- Flags applications needing review
- Saves for user submission

### 5. Semi-Automated Submission

- User reviews prepared applications
- System pre-fills form fields
- User manually clicks "Submit" button
- System tracks application status

## Logging

Logs are stored in `logs/` directory:

- **app.log**: All application logs
- **error.log**: Error logs only
- **exceptions.log**: Uncaught exceptions
- **rejections.log**: Unhandled promise rejections

Log levels: `error`, `warn`, `info`, `debug`

## Safety & Ethics

### Rate Limiting

- Maximum 30 applications per day (configurable)
- 8-20 minute delays between applications
- Only operates during business hours (9 AM - 6 PM)
- Respects daily limits strictly

### Anti-Detection Measures

- Random delays between actions
- Human-like typing and clicking
- Mouse movement simulation
- User agent rotation
- Stealth browser configuration
- Session persistence (no repeated logins)

### Terms of Service Compliance

- **Semi-automated approach**: User manually submits
- No mass application spam
- Quality over quantity (only matches > 70%)
- Respects rate limits
- Human oversight required

### Risks

⚠️ **Important Disclaimer:**

- Automated job applications may violate ZipRecruiter's ToS
- Account suspension/ban is possible
- Use at your own risk
- Intended for personal use only
- Not responsible for any consequences

## Troubleshooting

### ChromaDB Connection Error

```bash
# Make sure ChromaDB is running
docker ps | grep chroma

# Restart ChromaDB
docker run -p 8000:8000 chromadb/chroma
```

### Session Invalid

```bash
# Re-authenticate
npm run auth:setup
```

### No Resume Data

```bash
# Process your resume again
npm run resume:process
```

### CAPTCHA Detected

- System will pause if CAPTCHA appears
- Solve manually in the browser
- System will continue after solving

### 403 Forbidden Errors

- Account may be flagged
- Try reducing rate limits
- Wait 24-48 hours
- Use different IP/session

## Development

### Run in Development Mode

```bash
npm run dev
```

### Build for Production

```bash
npm run build
npm start
```

### Run TypeScript Files Directly

```bash
npx ts-node src/scripts/setupAuth.ts
```

## Future Enhancements

- [ ] CLI review interface
- [ ] Google Sheets integration
- [ ] Multi-job board support (Indeed, LinkedIn)
- [ ] Web UI dashboard
- [ ] Cover letter generation
- [ ] Interview preparation
- [ ] Email notifications
- [ ] Salary negotiation assistance

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues, questions, or feature requests:
- Open an issue on GitHub
- Check existing documentation
- Review logs for error details

## Acknowledgments

- **Anthropic Claude**: AI-powered matching and Q&A
- **Playwright**: Browser automation
- **ChromaDB**: Vector database for embeddings
- **LangChain**: AI agent framework

---

**Disclaimer**: This tool is for educational and personal use only. Use responsibly and at your own risk. Always review applications before submission and ensure compliance with platform terms of service.
