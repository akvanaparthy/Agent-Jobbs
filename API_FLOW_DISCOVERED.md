# ZipRecruiter 1-Click Apply - Complete API Flow Documentation

*Discovered: 2025-11-15 through passive monitoring*
*Log file: `data/logs/api-passive-1763223312146.log`*

---

## Overview

ZipRecruiter's 1-Click Apply uses a **multi-step interview API** where:
- Questions are fetched via GET
- Answers are submitted via POST
- POST responses may contain **more questions** (multi-step)
- Flow continues until `status: "REVIEW"` (application complete)

---

## Complete Flow

### Single-Group Application (1 step)

```
1. Click "1-Click Apply" button
   ↓
2. GET /apply/api/v2/interview?listing_key={key}&placement_id={id}
   Response: {
     totalGroups: 1,
     totalQuestions: 5,
     group: 1,
     status: "SCREENING_QUESTIONS",
     questionAnswerGroup: { questions: [...] }
   }
   ↓
3. User fills questions
   ↓
4. POST /apply/api/v2/interview?listing_key={key}&group=1&placement_id={id}
   Body: { answer_holders: [{answers: [...]}] }
   Response: {
     status: "REVIEW",          // ← Complete!
     totalGroups: 1,
     totalQuestions: 5
   }
   ↓
5. Application complete, modal closes
```

### Multi-Group Application (2+ steps)

```
1. Click "1-Click Apply" button
   ↓
2. GET /apply/api/v2/interview?listing_key={key}&placement_id={id}
   Response: {
     totalGroups: 2,            // ← Note: 2 groups!
     totalQuestions: 14,
     group: 1,
     status: "SCREENING_QUESTIONS",
     questionAnswerGroup: {
       group: 1,
       questions: [...]          // Group 1 questions
     }
   }
   ↓
3. User fills group 1 questions
   ↓
4. POST /apply/api/v2/interview?listing_key={key}&group=1&placement_id={id}
   Body: { answer_holders: [{answers: [...]}] }
   Response: {
     status: "SCREENING_QUESTIONS",  // ← Still screening!
     totalGroups: 2,
     group: 2,                        // ← Now on group 2
     questionAnswerGroup: {           // ← More questions!
       group: 2,
       questions: [...]               // Group 2 questions
     }
   }
   ↓
5. User fills group 2 questions
   ↓
6. POST /apply/api/v2/interview?listing_key={key}&group=2&placement_id={id}
   Body: { answer_holders: [{answers: [...]}] }
   Response: {
     status: "REVIEW",                // ← Complete!
     totalGroups: 2,
     totalQuestions: 14
     // NO questionAnswerGroup
   }
   ↓
7. Application complete, modal closes
```

---

## API Endpoints

### GET /apply/api/v2/interview

**Purpose:** Fetch interview questions for a job

**Parameters:**
- `listing_key` (required): Unique job identifier
- `placement_id` (required): Placement identifier (always 44071)

**Response:**

```json
{
  "totalGroups": 1,              // Total number of question groups
  "totalQuestions": 5,           // Total questions across all groups
  "group": 1,                    // Current group number
  "status": "SCREENING_QUESTIONS", // Application status
  "atsName": "greenhouse",       // ATS system name
  "applicationId": "uuid",       // Unique application ID
  "questionAnswerGroup": {
    "group": 1,
    "cargo": {
      "QUESTION_GROUP_CATEGORY": "job" // or "compliance"
    },
    "applicationId": "uuid",
    "questions": [
      {
        "id": "question_123",
        "order": 1,
        "required": true,
        "question": {
          "id": "question_123",
          "type": "textField",      // or "select", "info"
          "text": "Question text",
          "order": 1,
          "required": true,
          "minLength": -1,          // -1 means no limit
          "maxLength": -1,
          "options": [...]          // Only for type:"select"
        }
      }
    ]
  }
}
```

### POST /apply/api/v2/interview

**Purpose:** Submit answers for current group

**Parameters:**
- `listing_key` (required): Same as GET
- `group` (required): Group number being submitted (1, 2, ...)
- `placement_id` (required): Same as GET

**Request Body:**

```json
{
  "answer_holders": [
    {
      "answers": [
        {
          "id": "question_123",
          "answer": ["User's answer"]  // Always array, even for single values
        },
        {
          "id": "question_124",
          "answer": [""]               // Empty for skipped/info questions
        }
      ]
    }
  ]
}
```

**Response (More Questions):**

```json
{
  "status": "SCREENING_QUESTIONS",   // Still more to go
  "totalGroups": 2,
  "totalQuestions": 14,
  "group": 2,                         // Next group number
  "atsName": "greenhouse",
  "applicationId": "uuid",
  "questionAnswerGroup": {            // Next set of questions!
    "group": 2,
    "questions": [...]
  }
}
```

**Response (Application Complete):**

```json
{
  "status": "REVIEW",                 // Done!
  "totalGroups": 2,
  "totalQuestions": 14,
  "atsName": "greenhouse",
  "applicationId": "uuid"
  // NO questionAnswerGroup field
}
```

---

## Question Types

### 1. textField

**Purpose:** Free-text input
**Rendering:** `<input type="text">` or `<textarea>`

```json
{
  "id": "preferred_name",
  "type": "textField",
  "text": "Preferred First Name",
  "required": true,
  "minLength": -1,
  "maxLength": -1,
  "order": 1
}
```

**Answer Format:**
```json
{
  "id": "preferred_name",
  "answer": ["John"]
}
```

### 2. select

**Purpose:** Dropdown selection
**Rendering:** `<select>` or radio buttons

```json
{
  "id": "question_123",
  "type": "select",
  "text": "Are you authorized to work in the US?",
  "required": true,
  "options": [
    { "value": "1", "label": "Yes" },
    { "value": "0", "label": "No" }
  ],
  "order": 2
}
```

**Answer Format:**
```json
{
  "id": "question_123",
  "answer": ["1"]  // Value, not label
}
```

### 3. info

**Purpose:** Informational text only (no user input)
**Rendering:** Display HTML content, no input field

```json
{
  "id": "eeo-info-1",
  "type": "info",
  "questionHtml": "<p>Legal text about EEO...</p>",
  "order": 1
}
```

**Answer Format:**
```json
{
  "id": "eeo-info-1",
  "answer": [""]  // Empty string, but must be included!
}
```

---

## Question Categories

### Job Questions (Group 1)
`QUESTION_GROUP_CATEGORY: "job"`

Common questions:
- Preferred name
- LinkedIn profile URL
- GitHub/portfolio URLs
- Current location
- Work authorization
- Visa sponsorship needs

### Compliance Questions (Group 2)
`QUESTION_GROUP_CATEGORY: "compliance"`

EEO/diversity questions:
- Disability status
- Veteran status
- Race/ethnicity
- Gender

**Note:** Most compliance questions are optional (can submit empty answers)

---

## Detection Logic

### How to Know Application is Complete

```typescript
function isApplicationComplete(response: any): boolean {
  return (
    response.status === "REVIEW" &&
    !response.hasOwnProperty('questionAnswerGroup')
  );
}
```

### How to Know There Are More Questions

```typescript
function hasMoreQuestions(response: any): boolean {
  return (
    response.status === "SCREENING_QUESTIONS" &&
    response.hasOwnProperty('questionAnswerGroup')
  );
}
```

### Get Next Group Number

```typescript
function getNextGroup(response: any): number | null {
  if (hasMoreQuestions(response)) {
    return response.group;  // Already incremented by API
  }
  return null;
}
```

---

## Implementation Notes

### Answer Validation

1. **All questions must be answered** (even "info" types with empty strings)
2. **Answers are always arrays:** `answer: ["value"]`, never `answer: "value"`
3. **Select questions:** Use `value`, not `label`
4. **Optional questions:** Can submit empty string `answer: [""]`
5. **Info questions:** Must include with `answer: [""]`

### Character Limits

- `maxLength: -1` means no limit
- Some fields may have specific limits (need to validate during form fill)
- **TODO:** Check if API enforces limits or just UI

### Required Fields

- Check both question-level and nested question.required
- Info questions are NOT required but must be in payload
- EEO questions often allow "prefer not to answer" (empty or specific value)

### Error Handling

**Status Codes:**
- `200`: Success (check body for next step)
- `400`: Bad request (invalid answers?)
- `404`: Job no longer available
- `500`: Server error

**TODO:** Capture error responses to document error structure

---

## ATS Systems Encountered

1. **greenhouse** - Most common, uses the multi-group pattern
2. *Others TBD* - May have different response structures

---

## Instant Apply (No Questions)

**Note:** No examples captured in this session.

**Hypothesis:** Jobs without questions may:
- Return `totalQuestions: 0` in GET response
- Skip interview API entirely (direct POST to different endpoint?)
- Redirect to external ATS

**TODO:** Monitor an instant-apply job to confirm

---

## Complete Example

### Job with 2 Groups (14 total questions)

**Step 1: GET Initial Questions**
```http
GET /apply/api/v2/interview?listing_key=6Srtu-MkunINY1s45HdOHQ&placement_id=44071
```

Response: Group 1 (6 questions - LinkedIn, GitHub, location, work auth, etc.)

**Step 2: POST Group 1 Answers**
```http
POST /apply/api/v2/interview?listing_key=6Srtu-MkunINY1s45HdOHQ&group=1&placement_id=44071

{
  "answer_holders": [{
    "answers": [
      {"id": "question_7650434101", "answer": ["https://linkedin.com/in/user"]},
      {"id": "question_7650435101", "answer": ["https://github.com/user"]},
      ...
    ]
  }]
}
```

Response: Group 2 (8 questions - EEO/compliance: disability, veteran, race, gender)

**Step 3: POST Group 2 Answers**
```http
POST /apply/api/v2/interview?listing_key=6Srtu-MkunINY1s45HdOHQ&group=2&placement_id=44071

{
  "answer_holders": [{
    "answers": [
      {"id": "eeo-info-1", "answer": [""]},
      {"id": "eeo-info-2", "answer": [""]},
      {"id": "disability_status", "answer": [""]},
      {"id": "veteran_status", "answer": [""]},
      {"id": "race", "answer": ["2"]},
      {"id": "gender", "answer": ["1"]}
    ]
  }]
}
```

Response: `status: "REVIEW"` - Application complete!

---

## Next Steps for Implementation

1. ✅ API structure documented
2. ⏳ Implement question parser from JSON
3. ⏳ Implement multi-group handler (loop until status="REVIEW")
4. ⏳ Build answer formatter (ensure array format, include info questions)
5. ⏳ Test with various question types
6. ⏳ Handle edge cases (errors, timeouts, unavailable jobs)

---

*Last Updated: 2025-11-15*
*Status: API Discovery Complete*
