# ZipRecruiter Search Filter Configuration

## Overview
All filters are applied via URL parameters directly in the search request for maximum efficiency. No need to click dropdowns or wait for UI interactions.

## Available Filters

### 1. **Search Radius** (`SEARCH_RADIUS`)
Controls how far from the location to search for jobs.

**Options:**
- `5` - Within 5 miles
- `10` - Within 10 miles
- `25` - Within 25 miles *(default)*
- `50` - Within 50 miles
- `5000` - Any distance

**Example:**
```env
SEARCH_RADIUS=10
```

---

### 2. **Remote Work Filter** (`REMOTE_FILTER`)
Filter jobs by remote/in-person availability.

**Options:**
- `all` - All remote/in-person *(default)*
- `no_remote` - In-person jobs only
- `only_remote` - Remote jobs only

**Example:**
```env
REMOTE_FILTER=only_remote
```

---

### 3. **Experience Level** (`EXPERIENCE_LEVEL`)
Filter by required experience level.

**Options:**
- `all` - All experience levels *(default)*
- `senior` - Senior level positions
- `mid` - Mid-level positions
- `junior` - Junior level positions
- `no_experience` - Entry-level (no experience required)

**Example:**
```env
EXPERIENCE_LEVEL=senior
```

---

### 4. **Date Posted** (`DATE_FILTER`)
Filter by how recently the job was posted.

**Options:**
- `past_day` - Within 1 day
- `past_week` - Within 7 days *(default)*
- `past_month` - Within 30 days
- `any_time` - Posted anytime

**Example:**
```env
DATE_FILTER=past_day
```

---

## How It Works

### URL Parameter Mapping
Based on ZipRecruiter's actual filter parameters:

| Config Setting | URL Parameter | Example Value |
|---------------|---------------|---------------|
| `SEARCH_RADIUS=25` | `radius=25` | `?radius=25` |
| `DATE_FILTER=past_week` | `days=7` | `?days=7` |
| `REMOTE_FILTER=only_remote` | `refine_by_location_type=only_remote` | `?refine_by_location_type=only_remote` |
| `EXPERIENCE_LEVEL=senior` | `refine_by_experience_level=senior` | `?refine_by_experience_level=senior` |

### Example Search URL
With these settings:
```env
SEARCH_KEYWORDS=AI engineer
SEARCH_LOCATIONS=New York, NY
SEARCH_RADIUS=25
DATE_FILTER=past_week
REMOTE_FILTER=all
EXPERIENCE_LEVEL=senior
```

Generated URL:
```
https://www.ziprecruiter.com/jobs-search?search=AI+engineer&location=New+York,+NY&radius=25&days=7&refine_by_experience_level=senior
```

---

## Configuration Examples

### Scenario 1: Remote Senior Positions Only
```env
SEARCH_KEYWORDS=Senior Software Engineer
SEARCH_LOCATIONS=San Francisco, CA
SEARCH_RADIUS=5000  # Any distance for remote
DATE_FILTER=past_week
REMOTE_FILTER=only_remote
EXPERIENCE_LEVEL=senior
```

### Scenario 2: Local Entry-Level Jobs
```env
SEARCH_KEYWORDS=Software Engineer
SEARCH_LOCATIONS=Austin, TX
SEARCH_RADIUS=10  # Close to home
DATE_FILTER=past_day  # Fresh postings
REMOTE_FILTER=no_remote  # In-person only
EXPERIENCE_LEVEL=junior
```

### Scenario 3: Maximum Reach
```env
SEARCH_KEYWORDS=AI Engineer
SEARCH_LOCATIONS=New York, NY
SEARCH_RADIUS=5000  # Any distance
DATE_FILTER=any_time  # All postings
REMOTE_FILTER=all  # All types
EXPERIENCE_LEVEL=all  # All levels
```

---

## Implementation Details

### Code Changes Made

1. **`src/config/config.ts`**
   - Added `searchRadius`, `remoteFilter`, `experienceLevel` to config schema
   - Defaults: radius=25, remote=all, experience=all

2. **`src/types/index.ts`**
   - Updated `AppConfig` interface with new filter types

3. **`src/automation/zipRecruiterNav.ts`**
   - Rewrote `search()` method to build URL with query parameters
   - Removed old `applyDateFilter()` method (now part of search URL)
   - All filters applied in single request - faster and more reliable

4. **`src/index.ts`**
   - Updated search call to pass filter options
   - **FIXED: Browser now closes after extraction, before Claude AI matching**

---

## Troubleshooting

### Filter Not Working?
1. Check your `.env` file has the exact values listed above
2. Restart the application after changing `.env`
3. Check logs for the generated search URL
4. Verify ZipRecruiter hasn't changed their URL parameters

### No Jobs Found?
Try relaxing filters:
- Increase `SEARCH_RADIUS`
- Change `REMOTE_FILTER` to `all`
- Change `DATE_FILTER` to `any_time`
- Change `EXPERIENCE_LEVEL` to `all`

---

## Future Enhancements

Additional filters available in ZipRecruiter but not yet implemented:

- `refine_by_employment` - Full-time, part-time, contract, internship
- `refine_by_salary` - Minimum salary filtering
- `refine_by_apply_type` - Has ZipApply vs all jobs

These can be added to the configuration in the future if needed.
