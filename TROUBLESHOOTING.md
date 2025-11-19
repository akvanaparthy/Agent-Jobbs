# Troubleshooting Guide

## Common Issues and Solutions

### ❌ All Jobs Score 0% / No Applications Possible

**Symptom:**
```
Job description matching failed
"You have reached your specified API usage limits"
0 jobs meet minimum score (60%)
```

**Cause:** Anthropic API rate limit reached

**Solutions:**

1. **Wait for Rate Limit Reset** (Free tier)
   - Check error message for reset date (e.g., "2025-12-01 at 00:00 UTC")
   - Free tier resets monthly
   - No action needed, just wait

2. **Use Different API Key** (Immediate fix)
   ```bash
   # Get new key from: https://console.anthropic.com/settings/keys

   # Update .env file:
   ANTHROPIC_API_KEY=sk-ant-your-new-key-here

   # Restart application
   npm start
   ```

3. **Upgrade API Tier** (Recommended for production)
   - Visit: https://console.anthropic.com/settings/billing
   - Add payment method
   - Higher rate limits
   - Pay-as-you-go pricing

**Cost Estimate:**
- ~$0.05-0.15 per job application (using Haiku model)
- ~$1.50-4.50 for 30 applications/day
- Much cheaper than manual application time

---

### ❌ Not Logged In / Session Invalid

**Symptom:**
```
No valid session found
Session is invalid - redirected to login
```

**Solution:**
```bash
npm run auth:profile
```

Then manually log in to ZipRecruiter in the browser that opens.

---

### ❌ No Resume Data Found

**Symptom:**
```
No resume data found! Please run: npm run resume:process
```

**Solution:**
```bash
# 1. Add resume to data/resume/ folder (PDF, DOCX, or TXT)
# 2. Process it:
npm run resume:process
```

---

### ❌ ChromaDB Connection Error

**Symptom:**
```
Failed to connect to ChromaDB
Connection refused on localhost:8000
```

**Solution:**

**Option A: Docker (Recommended)**
```bash
docker run -p 8000:8000 chromadb/chroma
```

**Option B: Local Installation**
```bash
pip install chromadb
chroma run --path ./data/chromadb
```

---

### ❌ TypeScript Build Errors

**Symptom:**
```
src/legacy/automation/... Cannot find module
```

**Solution:**
Legacy folder is excluded from build. This is expected and safe to ignore.

If seeing errors in non-legacy files:
```bash
npm run build 2>&1 | grep -v legacy
```

---

### ⚠️ Cloudflare Challenge Detected

**Symptom:**
```
Cloudflare challenge detected - may need manual intervention
```

**Solution:**
- Using persistent profile should bypass this automatically
- If stuck, solve challenge manually in browser
- Profile will remember solution for future runs

**Prevention:**
```bash
# Ensure persistent context is enabled:
USE_PERSISTENT_CONTEXT=true  # in .env
```

---

### ⚠️ Vision API Errors

**Symptom:**
```
Vision-based finding error
Element not found via vision
```

**Solution:**
- System automatically falls back to CSS selectors
- No action needed
- Vision is supplementary, not required

**To disable vision entirely:**
- Comment out vision calls in `src/flows/interactiveApplicationFlow.ts`
- System uses selector-based approach only

---

### ⚠️ Apply Button Not Found

**Symptom:**
```
No 1-Click Apply button found with any method
```

**Possible Causes:**
1. Job is not actually "Easy Apply"
2. Need to scroll to button
3. Button text changed

**Solution:**
- System will skip job automatically
- Job saved to Excel without application
- Can apply manually later

---

### ❌ Build Succeeds But Nothing Runs

**Check:**
```bash
# 1. Verify .env file exists and has required keys:
ANTHROPIC_API_KEY=sk-ant-...

# 2. Verify ChromaDB is running:
curl http://localhost:8000/api/v1/heartbeat

# 3. Check logs:
tail -50 logs/error.log
```

---

## Debug Mode

Enable detailed logging:
```bash
# In .env:
LOG_LEVEL=debug

# Restart:
npm start
```

Check logs:
```bash
tail -f logs/app.log
```

---

## Getting Help

1. **Check Logs:**
   ```bash
   ls -lth logs/*.log
   tail -100 logs/error.log
   ```

2. **Check Issue Tracker:**
   - Search existing issues
   - Create new issue with logs

3. **Common Log Locations:**
   - `logs/app.log` - All activity
   - `logs/error.log` - Errors only
   - `logs/exceptions.log` - Crashes
   - `data/logs/` - Browser-specific logs

---

## Performance Issues

### Slow Matching

**Cause:** Using Sonnet instead of Haiku

**Solution:**
```bash
# In .env:
CLAUDE_MODEL=claude-3-5-haiku-20241022

# Haiku is 3x faster and cheaper
```

### High API Costs

**Monitor usage:**
- https://console.anthropic.com/settings/usage

**Reduce costs:**
1. Use Haiku model (3x cheaper)
2. Lower `MAX_APPLICATIONS_PER_DAY`
3. Increase `MIN_APPLY_SCORE` to be more selective
4. Disable vision validation (comment out in code)

---

## Reset Everything

If system is in bad state:

```bash
# 1. Stop all processes
# 2. Clear generated data:
rm -rf dist/
rm -rf data/chromadb/
rm -rf data/sessions/
rm -rf logs/*.log

# 3. Rebuild:
npm run build

# 4. Re-authenticate:
npm run auth:profile

# 5. Re-process resume:
npm run resume:process

# 6. Restart:
npm start
```

---

## Rate Limit Prevention

**Best Practices:**
1. Don't run multiple instances simultaneously
2. Use `DRY_RUN=true` for testing
3. Set reasonable `MAX_APPLICATIONS_PER_DAY` (30 or less)
4. Monitor API usage regularly
5. Consider upgrading to paid tier for production use

**Free Tier Limits (Anthropic):**
- Varies by model
- Resets monthly
- Check: https://console.anthropic.com/settings/limits
