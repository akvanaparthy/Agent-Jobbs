# How to Import Cookies from ZipRecruiter

This guide shows you how to manually copy cookies from your browser after logging in to ZipRecruiter.

## 🎯 Why Use Manual Cookie Import?

- ✅ Avoids browser automation detection
- ✅ Works with any 2FA/security setup
- ✅ Simple copy-paste approach
- ✅ No password/OTP needed in scripts

---

## 📋 Step-by-Step Guide

### Step 1: Log in to ZipRecruiter

1. Open Chrome, Edge, or Firefox
2. Go to https://www.ziprecruiter.com
3. Log in with your credentials (complete any 2FA if needed)
4. Make sure you're fully logged in and see your dashboard

### Step 2: Open Browser DevTools

**Chrome/Edge:**
- Press `F12` OR
- Right-click anywhere → "Inspect" → Go to "Application" tab

**Firefox:**
- Press `F12` OR  
- Right-click anywhere → "Inspect" → Go to "Storage" tab

### Step 3: Find Cookies

In DevTools:
1. Look for "Cookies" in the left sidebar
2. Expand the "Cookies" section
3. Click on `https://www.ziprecruiter.com`
4. You'll see a list of all cookies

### Step 4: Identify Important Cookies

Look for cookies with these names (copy ALL of them):
- `sessionid` or `session_id` ⭐ MOST IMPORTANT
- `csrftoken` or `csrf_token` ⭐ IMPORTANT
- `user_id` or `uid`
- `auth_token` or `authentication`
- Any cookie containing "login", "auth", "session"

**TIP:** Just copy ALL cookies to be safe!

### Step 5: Export Cookies

#### Method A: Manual Copy (Recommended)

For each cookie, you'll see columns like:
- **Name**: Cookie name
- **Value**: Cookie value
- **Domain**: Usually `.ziprecruiter.com`
- **Path**: Usually `/`
- **Expires**: Date/timestamp
- **HttpOnly**: Checkbox (yes/no)
- **Secure**: Checkbox (yes/no)
- **SameSite**: Lax/Strict/None

Create a JSON object for each cookie:

```json
{
  "name": "sessionid",
  "value": "abc123xyz789...",
  "domain": ".ziprecruiter.com",
  "path": "/",
  "expires": 1734134400,
  "httpOnly": true,
  "secure": true,
  "sameSite": "Lax"
}
```

#### Method B: Use Browser Extension (Easiest)

1. Install "EditThisCookie" or "Cookie-Editor" extension
2. Click the extension icon on ziprecruiter.com
3. Click "Export" → Copy all cookies
4. You'll get JSON format automatically!

### Step 6: Paste Cookies into .env File

1. Open your `.env` file in the project root
2. Find the line: `ZIPRECRUITER_COOKIES=`
3. Paste your cookies as a JSON array on ONE line:

```env
ZIPRECRUITER_COOKIES='[{"name":"sessionid","value":"YOUR_VALUE","domain":".ziprecruiter.com","path":"/","expires":1734134400,"httpOnly":true,"secure":true,"sameSite":"Lax"},{"name":"csrftoken","value":"YOUR_VALUE","domain":".ziprecruiter.com","path":"/","expires":1734134400,"httpOnly":false,"secure":true,"sameSite":"Lax"}]'
```

**IMPORTANT:**
- Wrap the entire JSON array in **single quotes** `'...'`
- Keep it on ONE line (no line breaks)
- Use double quotes `"` inside the JSON
- Escape any special characters if needed

**Example with multiple cookies:**
```env
ZIPRECRUITER_COOKIES='[{"name":"sessionid","value":"abc123xyz"},{"name":"csrftoken","value":"def456"}]'
```

### Step 7: Run Import Script

```bash
npm run auth:import
```

If successful, you'll see:
```
✓ Session file created successfully!
📁 Location: c:\...\data\sessions\ziprecruiter-session.json

✅ You can now run: npm start
```

---

## 🔍 Cookie Details Reference

### Expires/Max-Age
- If you see a date like "2024-12-14", convert to Unix timestamp
- Or use a large number like `1767225600` (year 2026)
- Session cookies can have `expires: -1`

### Domain
- Usually `.ziprecruiter.com` (with the leading dot)
- Sometimes `www.ziprecruiter.com` or `ziprecruiter.com`

### HttpOnly
- `true` = Cookie not accessible via JavaScript
- `false` = Cookie accessible via JavaScript

### Secure
- `true` = Cookie only sent over HTTPS
- `false` = Cookie sent over HTTP/HTTPS

### SameSite
- `Lax` = Most common, sent with top-level navigation
- `Strict` = Only sent to same site
- `None` = Sent with all requests (requires Secure=true)

---

## ✅ Verification

After importing, verify the session works:

```bash
npm start
```

If you see errors about invalid session:
- ❌ Cookies may have expired
- ❌ Missing required cookies
- ❌ Wrong domain/path values

**Solution:** Log in again and re-export fresh cookies

---

## 🛡️ Security Notes

- ⚠️ **Never share your cookies publicly!** They give full access to your account
- ⚠️ Cookies expire - you may need to re-import every 30 days
- ⚠️ If you log out on the browser, cookies become invalid
- ✅ The session file is gitignored for safety

---

## 🎬 Quick Summary

```bash
# 1. Log in to ZipRecruiter in your browser
# 2. F12 → Application → Cookies → ziprecruiter.com
# 3. Copy all cookies (or use Cookie Editor extension)
# 4. Paste into src/scripts/importCookies.ts
# 5. Run import
npm run auth:import

# 6. Done! Now you can run the app
npm start
```

---

## 🆘 Troubleshooting

**Q: "Session is invalid" after importing**
- Make sure you're still logged in on the browser
- Copy fresh cookies
- Include ALL cookies, not just a few

**Q: "No cookies found" error**
- Check that ZIPRECRUITER_COOKIES is set in .env
- Make sure the JSON is valid (use a JSON validator)
- Ensure it's wrapped in single quotes

**Q: "Invalid JSON format" error**
- Remove any line breaks - keep it on ONE line
- Check for missing commas or brackets
- Use double quotes inside, single quotes outside

**Q: How long do cookies last?**
- Usually 30 days for ZipRecruiter
- You'll need to re-import when they expire

**Q: Can I use incognito/private mode?**
- No - cookies won't persist properly
- Use normal browser window

---

**Need help?** Check the logs or open an issue on GitHub!
