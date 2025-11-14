# Pagination Configuration Guide

## Overview
You can now control how many pages of job listings to extract per keyword/location combination.

## Configuration Variable
```bash
MAX_PAGES_TO_EXTRACT=15
```

## Options

### 1. **Specific Number** (Recommended)
```bash
MAX_PAGES_TO_EXTRACT=15   # Extract exactly 15 pages
```
- Predictable extraction time
- Good balance between coverage and speed
- Recommended for daily job searches

### 2. **Extract All Pages**
```bash
MAX_PAGES_TO_EXTRACT=all  # or 'unlimited'
```
- Extracts until no more pages are available
- ⚠️ **Warning**: May take a very long time
- Use only when you need maximum coverage

## Common Use Cases

### Testing (Fast)
```bash
MAX_PAGES_TO_EXTRACT=1
```
- Only extracts first page (~20-25 jobs)
- Perfect for testing your configuration
- Fastest option

### Daily Job Hunt (Balanced)
```bash
MAX_PAGES_TO_EXTRACT=5
```
- Extracts ~100-125 jobs per combo
- Good balance of speed and coverage
- Recommended for daily searches

### Thorough Search (Comprehensive)
```bash
MAX_PAGES_TO_EXTRACT=15
```
- Extracts ~300-375 jobs per combo
- Thorough coverage without being excessive
- **Default setting**

### Maximum Coverage (Slow)
```bash
MAX_PAGES_TO_EXTRACT=all
```
- Extracts every available job
- Use sparingly (can take hours)
- Best for initial comprehensive search

## How It Works

1. **Pagination Loop**: The bot navigates through pages sequentially
2. **Per Combo**: Each keyword × location combination respects this limit
3. **Early Stop**: If ZipRecruiter runs out of pages before the limit, extraction stops
4. **Logging**: You'll see progress like "Processing page 5 of max 15"

## Code Implementation

### Location: `src/index.ts`
```typescript
const maxPages = config.maxPagesToExtract; // -1 for 'all', or specific number
const extractAllPages = maxPages === -1;

while (extractAllPages || pageCount < maxPages) {
  // Extract jobs from current page
  // ...
  
  // Check if more pages exist
  if (await navigator.hasNextPage() && (extractAllPages || pageCount < maxPages)) {
    await navigator.goToNextPage();
  } else {
    break; // No more pages or reached limit
  }
}
```

## Performance Estimates

| Pages | Jobs Per Combo | Time Estimate | Use Case |
|-------|----------------|---------------|----------|
| 1     | ~20-25        | 30 sec       | Testing |
| 5     | ~100-125      | 2-3 min      | Daily search |
| 10    | ~200-250      | 4-5 min      | Weekly search |
| 15    | ~300-375      | 6-8 min      | Thorough search |
| all   | Variable      | 10-60 min    | Maximum coverage |

*Note: Estimates are per keyword/location combo. Multiple combos multiply these times.*

## Example Scenarios

### Scenario 1: Quick Daily Check
```bash
SEARCH_KEYWORDS=software engineer
SEARCH_LOCATIONS=San Francisco, CA
MAX_PAGES_TO_EXTRACT=3
```
Result: ~60-75 jobs, ~1-2 minutes

### Scenario 2: Multi-Location Search
```bash
SEARCH_KEYWORDS=AI engineer; ML engineer
SEARCH_LOCATIONS=San Francisco, CA; New York, NY; Austin, TX
MAX_PAGES_TO_EXTRACT=10
```
Result: 2 keywords × 3 locations × 10 pages = ~1200-1500 jobs, ~15-20 minutes

### Scenario 3: Comprehensive Initial Search
```bash
SEARCH_KEYWORDS=developer
SEARCH_LOCATIONS=Remote
MAX_PAGES_TO_EXTRACT=all
```
Result: All available jobs, time varies greatly (could be 30+ min)

## Tips

1. **Start Small**: Test with `MAX_PAGES_TO_EXTRACT=1` first
2. **Monitor Logs**: Watch the console to see actual page counts
3. **Rate Limiting**: More pages = more API calls = longer delays between actions
4. **Job Limit**: The system also has a total job limit (default 50) that may stop extraction early
5. **Adjust Based on Results**: If you're getting enough quality matches with 5 pages, no need for 15

## Related Settings

```bash
# Total job limit across entire run (overrides page limits)
# Located in src/index.ts, line ~115
if (allJobs.length >= 50) {
  logger.info('Reached job limit (50)');
  break;
}
```

To change the total job limit, modify this hardcoded value in the source code.

## Changes Made

### Files Modified:
1. **src/config/config.ts**: Added `maxPagesToExtract` schema validation
2. **src/types/index.ts**: Added `maxPagesToExtract: number` to AppConfig interface
3. **src/index.ts**: Updated pagination loop to use configuration
4. **.env**: Added `MAX_PAGES_TO_EXTRACT=15` 
5. **.env.example**: Added documentation for the new setting

### Backward Compatibility:
- Old setting `SEARCH_PAGES_PER_COMBO` is still supported
- New `MAX_PAGES_TO_EXTRACT` is the recommended setting going forward
- If both are present, `MAX_PAGES_TO_EXTRACT` takes precedence

## Troubleshooting

**Q: It stops before reaching my page limit**  
A: Either ZipRecruiter ran out of pages, or the global job limit (50) was reached first.

**Q: Setting to 'all' doesn't seem to work**  
A: Make sure you typed exactly `all` or `unlimited` (case-insensitive). Numbers must be positive integers.

**Q: How do I know how many pages are available?**  
A: Watch the logs. When extraction stops, it will say either "Reached page limit" or "No more pages available".

**Q: Can I set different limits for different keywords?**  
A: Not currently. The setting applies globally to all keyword/location combos. You'd need to run the bot multiple times with different .env configurations.
