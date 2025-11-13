# Quick Start Guide

Get Agent-Jobbs running in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- Anthropic API key ([Get one here](https://console.anthropic.com/))
- ZipRecruiter account
- Docker (for ChromaDB)

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Start ChromaDB

```bash
docker run -p 8000:8000 chromadb/chroma
```

### 3. Configure Environment

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

```env
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Basic settings (you can adjust these later)
SEARCH_KEYWORDS=software engineer,developer
SEARCH_LOCATION=San Francisco, CA
DRY_RUN=true
```

### 4. Authenticate with ZipRecruiter

```bash
npm run auth:setup
```

**This will:**
- Open a browser
- Wait for you to log in
- Save your session

**Steps:**
1. Log in to ZipRecruiter in the browser that opens
2. Wait until you see your dashboard
3. Press ENTER in the terminal
4. Done! Your session is saved.

### 5. Add Your Resume

Copy your resume to `data/resume/`:

```bash
# Example (Windows)
copy "C:\path\to\your\resume.pdf" data\resume\

# Example (Mac/Linux)
cp ~/Documents/resume.pdf data/resume/
```

Supported formats: PDF, DOCX, TXT

### 6. Process Your Resume

```bash
npm run resume:process
```

**This will:**
- Parse your resume
- Extract skills, experience, education
- Store in vector database for matching

### 7. Run the System!

```bash
npm start
```

**First run will:**
- Search for jobs matching your keywords
- Analyze each job against your resume
- Prepare application answers
- Show you a summary

**Note:** With `DRY_RUN=true`, nothing is actually submitted.

## What Happens Next?

The system will:

1. ✅ Search ZipRecruiter for 1-Click Apply jobs
2. ✅ Match jobs against your resume (AI-powered)
3. ✅ Skip jobs with low match scores
4. ✅ Detect application questions
5. ✅ Generate answers using your resume
6. ✅ Save prepared applications
7. ✅ Show you a summary

**Output example:**

```
[info]: Found 45 job cards
[info]: Collected 12 1-Click Apply jobs
[info]: Processing job { title: 'Senior Software Engineer', company: 'Acme Corp' }
[info]: Title match { score: 0.85, threshold: 0.6 }
[info]: Full match analysis { overallScore: 0.78, threshold: 0.7 }
[info]: Job matches! Preparing application
[info]: Detected 5 questions
[info]: Questions answered { cached: 2, generated: 3, needsInput: 0 }
[info]: Application prepared { title: 'Senior Software Engineer', needsReview: false }

✓ Prepared 8 applications

DRY RUN MODE: No applications will be submitted.
To actually apply, set DRY_RUN=false in .env
```

## Customizing Your Search

Edit `.env` to customize:

```env
# What jobs to search for
SEARCH_KEYWORDS=python developer,backend engineer,full stack
SEARCH_LOCATION=Remote

# When jobs were posted
DATE_FILTER=past_week  # Options: past_day, past_week, past_month

# How selective to be
TITLE_MATCH_THRESHOLD=0.6   # 0.0-1.0 (lower = more jobs)
DESCRIPTION_MATCH_THRESHOLD=0.7  # 0.0-1.0

# Safety limits
MAX_APPLICATIONS_PER_DAY=30
MIN_DELAY_BETWEEN_APPS_MS=480000  # 8 minutes
```

## Troubleshooting

### "ChromaDB connection failed"

Make sure ChromaDB is running:

```bash
docker ps | grep chroma
```

If not running, start it:

```bash
docker run -p 8000:8000 chromadb/chroma
```

### "No resume data found"

Process your resume:

```bash
npm run resume:process
```

### "No valid session found"

Re-authenticate:

```bash
npm run auth:setup
```

### "API key invalid"

Check your `.env` file - make sure `ANTHROPIC_API_KEY` is set correctly.

## Next Steps

### Go Live (Actual Applications)

1. Review prepared applications carefully
2. Set `DRY_RUN=false` in `.env`
3. Run again: `npm start`
4. Applications will be submitted automatically

⚠️ **Warning:** Make sure you're comfortable with the prepared applications before going live!

### Adjust Match Thresholds

Too many jobs?
```env
TITLE_MATCH_THRESHOLD=0.7      # More selective
DESCRIPTION_MATCH_THRESHOLD=0.8
```

Not enough jobs?
```env
TITLE_MATCH_THRESHOLD=0.5      # Less selective
DESCRIPTION_MATCH_THRESHOLD=0.6
```

### Monitor Applications

Check logs:

```bash
cat logs/app.log
```

View stats:

```bash
# Coming soon: Dashboard UI
```

## Safety Tips

1. **Start with DRY_RUN=true** - Test first!
2. **Review prepared applications** - Check answers make sense
3. **Use conservative rate limits** - Don't spam
4. **Monitor for CAPTCHA** - System will pause if detected
5. **Check account status** - Make sure you're not flagged

## Getting Help

- 📖 Read [README.md](README.md) for full documentation
- 🐛 Found a bug? Open an issue on GitHub
- 💡 Have a question? Check the docs first
- ⚠️ Account issues? Contact ZipRecruiter support

## What's Missing?

This MVP includes most features. Coming soon:

- [ ] CLI review interface (currently logs only)
- [ ] Browser pre-fill (you review before submitting)
- [ ] Google Sheets export
- [ ] Web dashboard

But the core functionality works:
- ✅ Job finding
- ✅ AI matching
- ✅ Question answering
- ✅ Application tracking
- ✅ Rate limiting

## Success Checklist

- [ ] ChromaDB running
- [ ] Dependencies installed
- [ ] `.env` configured
- [ ] Authenticated with ZipRecruiter
- [ ] Resume processed
- [ ] First successful dry run
- [ ] Applications prepared
- [ ] Ready to go live!

---

Happy job hunting! 🎯
