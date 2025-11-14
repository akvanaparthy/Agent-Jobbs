# Agent-Jobbs Process Flow

## 🎯 Complete Workflow

### Phase 1: Job Collection ✅ (Optimized - FAST)
**Duration**: ~5 seconds for 20 jobs per page

```
1. Navigate to ZipRecruiter search
2. Parse embedded JSON (#js_variables)
3. Extract all job data without opening pages
4. Filter for 1-Click Apply only
5. Save to: data/jobs/jobs-{date}-{timestamp}.json
```

**Performance**: 
- Old way: 4 seconds per job × 20 = 80 seconds
- New way: Extract all from JSON = 5 seconds total
- **16x faster! 🚀**

---

### Phase 2: AI Job Matching 🤖 (CPU Intensive)
**Duration**: ~30-140 seconds for 7 jobs (varies by API response time)

For each 1-Click Apply job:

```
Step 1: Quick Title Match
├─ Send to Claude AI: Job title + Resume chunks
├─ Duration: 5-10 seconds
├─ Get: Score (0.0-1.0) + Reasoning
└─ If score < 0.6 → SKIP (saves time on full analysis)

Step 2: Full Description Analysis (if title passed)
├─ Send to Claude AI: Full job description + Resume
├─ Duration: 10-20 seconds  
├─ Get: Detailed report with:
│   ├─ Overall score
│   ├─ Skills match
│   ├─ Experience match
│   ├─ Matched skills list
│   ├─ Missing skills list
│   ├─ Strengths
│   └─ Concerns
└─ If score >= 0.7 → PROCEED to Phase 3
```

**Progress Indicators** (updated):
- 🤖 "Analyzing job title match..."
- 📡 "Calling Claude AI..."
- ✅ "Title analysis complete"
- 🔍 "Analyzing full job description..."
- 📡 "Calling Claude AI for detailed analysis (this may take 10-20 seconds)..."
- ✅ "Detailed analysis complete"

---

### Phase 3: Application Preparation 📝
**Duration**: ~10-30 seconds per job

For each matched job:

```
1. Navigate to job URL
2. Click "1-Click Apply" button
3. Wait for application form to appear
4. Detect questions:
   ├─ Text inputs
   ├─ Dropdowns
   ├─ Radio buttons
   ├─ Checkboxes
   └─ Text areas
5. Send questions to QA Agent (Claude AI)
6. Get answers based on:
   ├─ Resume data
   ├─ Q&A pairs in ChromaDB
   └─ Job context
7. Mark if needs human review
8. Save to: data/applications/prepared/
```

---

### Phase 4: Review & Submit 🎯
**Duration**: Depends on DRY_RUN setting

```
If DRY_RUN=true (current setting):
├─ Show summary to console
├─ List jobs that need review
└─ Wait for manual approval

If DRY_RUN=false:
├─ Auto-submit applications
├─ Track in data/applications/applied/
├─ Respect rate limits (30-60 sec between apps)
└─ Stay within daily limit (30 apps/day)
```

---

## 📊 Current Configuration

### Thresholds
- **Title Match**: 0.6 (60% match required)
- **Description Match**: 0.7 (70% overall match required)

### Rate Limits
- **Max Apps/Day**: 30
- **Delay Between Apps**: 30-60 seconds (random)
- **Operating Hours**: 9 AM - 6 PM

### Job Search
- **Keywords**: frontend developer, AI engineer, ai architect, ai first developer
- **Location**: San Francisco, CA
- **Date Filter**: Past week
- **Max Pages**: 10 (up to 200 jobs scanned)
- **Job Limit**: 50 jobs collected

---

## 🐛 What Happened in Your Last Run

### Timeline
```
19:01:30 - Started application
19:01:34 - Session loaded (persistent browser)
19:02:01 - Search completed
19:02:03 - Extracted 20 jobs from JSON (instant!)
19:02:03 - Filtered to 7 1-Click Apply jobs
19:03:05 - Pagination failed (no next button found)
19:03:05 - Jobs saved (7 total)
19:03:05 - Started matching: "Founding Applied AI Engineer"
[STUCK HERE - Browser closed during Claude API call]
```

### Why It Appeared Stuck
1. **No visible progress** - Claude API call was in progress
2. **Silent AI processing** - Takes 10-20 seconds per call
3. **First job** - Was analyzing title match when you closed browser
4. **Expected behavior** - Would have shown progress logs after update

---

## ✅ What's Working

1. ✅ **Persistent browser** - No more Cloudflare challenges
2. ✅ **Fast job extraction** - JSON parsing instead of DOM scraping
3. ✅ **Resume in ChromaDB** - 8 chunks with OpenAI embeddings
4. ✅ **Job storage** - 7 jobs saved successfully
5. ✅ **Session persistence** - Browser survives restarts

---

## 🔧 What to Do Next

### Option 1: Test Full Matching Flow
```bash
npm start
# Let it run for ~2-3 minutes
# Watch for progress indicators
# See which jobs pass matching
```

### Option 2: Lower Thresholds (Get More Matches)
Edit `.env`:
```
TITLE_MATCH_THRESHOLD=0.5      # Was 0.6
DESCRIPTION_MATCH_THRESHOLD=0.6 # Was 0.7
```

### Option 3: Test Single Job (Debug)
Temporarily limit to 1 job in `src/index.ts`:
```typescript
if (allJobs.length >= 1) { // Was 50
  logger.info('Reached job limit (1)');
  break;
}
```

### Option 4: Skip Matching (Test Phase 3)
Comment out threshold checks in `src/index.ts` to always proceed to application prep.

---

## 📂 File Locations

### Data Files
```
data/
├── jobs/                          # Scraped jobs
│   └── jobs-2025-11-14-*.json    # Latest: 7 jobs
├── applications/
│   ├── prepared/                  # Ready for review
│   └── applied/                   # Submitted
├── chromadb/                      # Vector database
│   ├── Resume chunks: 8
│   └── Q&A pairs: 0
├── browser-profile/               # Persistent session
└── resume/                        # Your PDF
```

### Logs
```
logs/
└── app-YYYY-MM-DD.log            # Daily log files
```

---

## 🎯 Success Metrics

From your last run:
- ✅ 20 jobs found in 5 seconds
- ✅ 7 1-Click Apply jobs identified (35% conversion)
- 🔄 0 jobs fully matched (interrupted)
- 🔄 0 applications prepared (didn't reach this phase)

Expected results when complete:
- ~3-5 jobs will pass matching (based on your thresholds)
- ~2-4 applications will be prepared
- ~1-2 may need human review for questions

---

## 💡 Tips

### Speed Up Testing
1. Set `HEADLESS=true` to hide browser
2. Lower `MAX_APPLICATIONS_PER_DAY` to 5 for testing
3. Reduce `minPages` in code to 1-2 pages

### Debug Issues
1. Check logs in `logs/app-YYYY-MM-DD.log`
2. Set `LOG_LEVEL=debug` for verbose output
3. Keep `DRY_RUN=true` until confident

### Monitor Progress
Watch for these log indicators:
- 🤖 = AI analyzing
- 📡 = API call in progress
- ✅ = Step complete
- ⚠️ = Warning (not critical)
- ❌ = Error (needs attention)
