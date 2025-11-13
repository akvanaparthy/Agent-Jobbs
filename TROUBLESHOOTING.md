# Troubleshooting Guide

## Authentication Issues

### Problem: "Use a different email" error during login

**Why this happens:**
ZipRecruiter has bot detection that identifies automated browsers, even with stealth mode enabled. When you navigate directly to their login page (`/login`), their detection is more aggressive and may block you.

**Why incognito works:**
When you open the same URL in a regular browser's incognito mode, you're not using automated browser features (like Playwright), so there are no automation indicators for ZipRecruiter to detect.

**Solution/Workaround:**

1. **Use the homepage login** (Recommended):
   - When the automated browser opens, manually navigate to: `https://www.ziprecruiter.com`
   - Click the "Sign In" button in the top right corner
   - Complete the login process there
   - This bypasses the aggressive detection on the direct `/login` page

2. **Alternative - Clear browser data**:
   ```bash
   # Delete the session file
   rm data/sessions/ziprecruiter-session.json

   # Try again
   npm run auth:setup
   ```

3. **Alternative - Use a different approach**:
   - Let the script navigate to `/login`
   - If you see the error, manually type the homepage URL in the address bar
   - Log in from there instead

**There is NO timeout** - You can take as long as you need to complete the login!

---

## What We Did to Improve Stealth

The system now includes enhanced anti-detection measures:

1. ✅ **Removed `navigator.webdriver`** property
2. ✅ **Added fake plugins** (PDF viewer, etc.)
3. ✅ **Spoofed hardware specs** (CPU cores, memory)
4. ✅ **Added Chrome runtime objects**
5. ✅ **Modified permissions API**
6. ✅ **Randomized user agents**
7. ✅ **Human-like behavior simulation**

However, ZipRecruiter's detection is sophisticated and may still flag the browser in some cases.

---

## Why Detection Still Happens

Even with stealth mode, some indicators remain:

1. **Browser automation APIs** - Playwright adds some internal properties
2. **Behavioral patterns** - Direct navigation to `/login` looks suspicious
3. **IP/Device fingerprinting** - They may track your device
4. **Timing patterns** - Perfect timing looks robotic

**The workaround (homepage login) works** because:
- It mimics normal user behavior (browse homepage → click sign in)
- Less aggressive detection on the homepage
- More natural navigation flow

---

## General Troubleshooting

### ChromaDB Connection Failed

```bash
# Start ChromaDB
docker run -p 8000:8000 chromadb/chroma

# Or if already running, restart it
docker restart $(docker ps -q --filter ancestor=chromadb/chroma)
```

### Session Invalid

```bash
# Re-authenticate
npm run auth:setup
```

### No Resume Data

```bash
# Add resume to data/resume/ then:
npm run resume:process
```

### Build Errors

```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

### CAPTCHA Appears

- The system will pause if CAPTCHA is detected
- Solve it manually in the browser
- System will continue automatically

### 403 Forbidden Errors

This means ZipRecruiter has blocked the request:

1. **Wait 24-48 hours** - Let the flag clear
2. **Reduce rate limits** in `.env`:
   ```env
   MAX_APPLICATIONS_PER_DAY=10
   MIN_DELAY_BETWEEN_APPS_MS=600000  # 10 minutes
   ```
3. **Check account status** - Log in manually to verify
4. **Try different times** - Apply during business hours only

---

## Understanding Bot Detection

### What ZipRecruiter Checks:

1. **`navigator.webdriver`** - Present in automated browsers ✅ We hide this
2. **Plugin count** - Automated browsers have fewer plugins ✅ We fake plugins
3. **Hardware specs** - Headless browsers report different specs ✅ We spoof these
4. **Behavior patterns** - Too perfect = bot ✅ We add randomness
5. **Navigation patterns** - Direct to login = suspicious ✅ Workaround: Use homepage
6. **Request timing** - Perfect intervals = bot ✅ We randomize delays
7. **IP reputation** - Known datacenter IPs flagged ❌ Can't fix (use home IP)

### Why Full Stealth Is Impossible:

- **Playwright itself** adds properties that can be detected
- **No browser is perfect** - All automation tools have tells
- **Detection evolves** - Sites constantly update their checks
- **Behavioral analysis** - ML models can detect patterns

### Our Approach:

Instead of trying to be 100% undetectable (impossible), we:
1. ✅ Hide obvious automation indicators
2. ✅ Simulate human behavior
3. ✅ Provide workarounds when detected
4. ✅ Use semi-automation (you submit manually)
5. ✅ Conservative rate limiting

This reduces risk while maintaining functionality.

---

## Best Practices

### For Authentication:

1. **Use the homepage workaround** if direct login fails
2. **Don't rush** - Take your time logging in
3. **Act naturally** - Move mouse, scroll, etc.
4. **Save session** - Only authenticate once

### For Job Applications:

1. **Start with DRY_RUN=true**
2. **Test with small batches** (5-10 jobs)
3. **Monitor for detection** (check logs)
4. **Use conservative limits** (20-30 apps/day max)
5. **Spread out applications** (8-20 min delays)
6. **Only apply during business hours**

### If You Get Flagged:

1. **Stop immediately** - Don't keep trying
2. **Wait 24-48 hours**
3. **Check account manually** - Log in normally
4. **Reduce rate limits** when you resume
5. **Consider the homepage approach** for future auth

---

## Getting Help

### Check Logs

```bash
# View application logs
cat logs/app.log

# View error logs only
cat logs/error.log

# Follow logs in real-time
tail -f logs/app.log
```

### Enable Debug Logging

In `.env`:
```env
LOG_LEVEL=debug
```

### Common Error Messages

**"No valid session found"**
- Run: `npm run auth:setup`

**"No resume data found"**
- Run: `npm run resume:process`

**"CAPTCHA detected"**
- System paused - solve CAPTCHA manually
- Press Enter to continue

**"403 Forbidden"**
- Account may be flagged
- Wait 24-48 hours
- Reduce rate limits

**"Rate limit reached"**
- Hit daily limit (30 apps by default)
- Wait until tomorrow
- Or adjust limit in `.env`

---

## Technical Details

### Why Playwright vs Puppeteer?

- Better TypeScript support
- Faster and more stable
- Better stealth capabilities
- Cross-browser support

### Why Not Use ZipRecruiter API?

- No public API for job seekers
- Only employer/partner APIs exist
- No API for applying to jobs
- **Must use browser automation**

### Can This Get My Account Banned?

**Yes, it's possible:**
- Automation likely violates ToS
- Aggressive behavior = higher risk
- Conservative usage = lower risk

**Risk mitigation:**
- Use dry-run mode first
- Conservative rate limits (20-30/day)
- Random delays (8-20 minutes)
- Semi-automation (you submit)
- Monitor for detection

**Our recommendation:**
- Use for job discovery and matching
- Let AI prepare answers
- **You review and submit manually**
- Focus on quality over quantity

---

## FAQ

**Q: Why does incognito work but the automated browser doesn't?**
A: Incognito uses a regular browser without automation. The automated browser has indicators that ZipRecruiter detects.

**Q: Can I use a VPN?**
A: Yes, but it might trigger additional checks. Home IP is usually better than datacenter IP.

**Q: How long does the session last?**
A: Sessions expire after 30 days or when ZipRecruiter logs you out.

**Q: Is there a way to completely avoid detection?**
A: No. All automation can be detected. We minimize risk but can't eliminate it.

**Q: Should I use this?**
A: Use for research and personal job hunting. Understand the risks. Don't abuse it.

**Q: What if I get banned?**
A: You can create a new account after waiting, but repeated bans may lead to permanent blocks.

---

## Success Tips

1. **Be patient** - Take time with auth
2. **Start small** - Test with 5-10 jobs
3. **Monitor closely** - Watch for detection
4. **Use workarounds** - Homepage login method
5. **Stay conservative** - Low rate limits
6. **Quality over quantity** - Only apply to good matches
7. **Manual review** - Check everything before submitting

---

**Remember:** This tool is for personal use to save time. Use it responsibly and at your own risk.
