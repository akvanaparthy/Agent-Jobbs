// ZipRecruiter URLs
export const ZIPRECRUITER_BASE_URL = 'https://www.ziprecruiter.com';
export const ZIPRECRUITER_LOGIN_URL = `${ZIPRECRUITER_BASE_URL}/login`;
export const ZIPRECRUITER_SEARCH_URL = `${ZIPRECRUITER_BASE_URL}/jobs-search`;

// User agents for rotation
export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
];

// Delays for human-like behavior (milliseconds)
export const DELAYS = {
  TYPING_MIN: 50,
  TYPING_MAX: 150,
  BETWEEN_FIELDS_MIN: 2000,
  BETWEEN_FIELDS_MAX: 5000,
  AFTER_CLICK_MIN: 1000,
  AFTER_CLICK_MAX: 3000,
  PAGE_LOAD_MIN: 2000,
  PAGE_LOAD_MAX: 5000,
  SCROLL_MIN: 500,
  SCROLL_MAX: 2000,
};

// Retry configuration
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 10000,
  BACKOFF_MULTIPLIER: 2,
};

// File paths
export const PATHS = {
  SESSION_FILE: './data/sessions/ziprecruiter-session.json',
  JOBS_DIR: './data/jobs',
  APPLICATIONS_PREPARED_DIR: './data/applications/prepared',
  APPLICATIONS_APPLIED_DIR: './data/applications/applied',
  RESUME_DIR: './data/resume',
  LOGS_DIR: './logs',
  CHROMA_DB_DIR: './data/chromadb',
};

// ChromaDB collection names
export const CHROMA_COLLECTIONS = {
  RESUME: 'resume_embeddings',
  QA_PAIRS: 'qa_pairs',
};

// Application status options
export const APPLICATION_STATUS = {
  APPLIED: 'applied',
  INTERVIEW: 'interview',
  REJECTED: 'rejected',
  OFFER: 'offer',
  WITHDRAWN: 'withdrawn',
} as const;

// Common application questions (for quick matching)
export const COMMON_QUESTIONS = {
  WORK_AUTHORIZATION: [
    'Are you authorized to work in',
    'Do you have the legal right to work',
    'work authorization',
    'work permit',
  ],
  YEARS_EXPERIENCE: [
    'How many years of experience',
    'Years of experience with',
    'years of professional experience',
  ],
  SALARY: [
    'desired salary',
    'salary expectations',
    'expected compensation',
    'salary range',
  ],
  START_DATE: [
    'When can you start',
    'earliest start date',
    'available to start',
    'notice period',
  ],
  RELOCATION: [
    'willing to relocate',
    'able to relocate',
    'relocation',
  ],
};

// Selectors for ZipRecruiter (may need updating if site changes)
export const SELECTORS = {
  // Search page
  SEARCH_KEYWORDS_INPUT: 'input[name="search"]',
  SEARCH_LOCATION_INPUT: 'input[name="location"]',
  SEARCH_BUTTON: 'button[type="submit"]',
  DATE_FILTER: 'select[name="days"]',

  // Job listings
  JOB_CARDS: '.job_result',
  JOB_TITLE: '.job_title',
  COMPANY_NAME: '.company_name',
  JOB_LOCATION: '.location',
  JOB_SALARY: '.salary',
  POSTED_DATE: '.posted_date',
  ONE_CLICK_APPLY_BUTTON: 'button[data-test="quick-apply-button"]',

  // Job details
  JOB_DESCRIPTION: '.job_description',
  APPLY_BUTTON: 'button[data-test="apply-button"]',

  // Application form
  APPLICATION_MODAL: '.application_modal',
  FORM_FIELDS: 'input, textarea, select',
  SUBMIT_BUTTON: 'button[type="submit"]',
  CONTINUE_BUTTON: 'button:has-text("Continue")',

  // Success/Error messages
  SUCCESS_MESSAGE: '.success_message',
  ERROR_MESSAGE: '.error_message',
  APPLIED_BADGE: '.applied_badge',

  // Pagination
  NEXT_PAGE_BUTTON: 'button[aria-label="Next"]',
  PAGE_NUMBERS: '.pagination a',
};

// HTTP status codes to handle
export const HTTP_CODES = {
  OK: 200,
  FORBIDDEN: 403,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
};

// Embedding dimensions
export const EMBEDDING_DIMENSIONS = {
  CLAUDE: 1024,
  OPENAI_SMALL: 1536,
  OPENAI_LARGE: 3072,
  SENTENCE_TRANSFORMERS: 384,
};
