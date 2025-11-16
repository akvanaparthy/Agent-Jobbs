// Application modes
export enum ApplicationMode {
  SCRAPE = 'scrape',           // Scrape and save only
  INTERACTIVE = 'interactive'  // Apply interactively
}

// Job-related types
export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  postedDate: string;
  url: string;
  description: string;
  hasOneClickApply: boolean;
  listingKey?: string;  // ZipRecruiter listing key for API calls
  scrapedAt: string;
}

// Match score and analysis
export interface MatchReport {
  overallScore: number;
  skillsMatch: number;
  experienceMatch: number;
  reasoning: string;
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  concerns: string[];
}

// Resume chunk for vector storage
export interface ResumeChunk {
  id: string;
  text: string;
  section: 'experience' | 'skills' | 'education' | 'projects' | 'summary';
  metadata: {
    company?: string;
    role?: string;
    dateRange?: string;
    technologies?: string[];
    [key: string]: any;
  };
}

// Application question types
export interface ApplicationQuestion {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'radio';
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  defaultValue?: string;
}

// Answer with confidence
export interface Answer {
  questionId: string;
  answer: string;
  confidence: number;
  source: 'cached' | 'generated' | 'user_input_required' | 'user_input';
}

// Prepared application package
export interface PreparedApplication {
  id: string;
  job: JobListing;
  matchReport: MatchReport;
  questions: ApplicationQuestion[];
  answers: Answer[];
  needsReview: boolean;
  coverLetter?: string;
  createdAt: string;
}

// Applied job tracking
export interface AppliedJob {
  id: string;

  // Job reference (can be full job object or separate fields)
  job?: JobListing;
  jobId?: string;
  title?: string;
  company?: string;
  url?: string;

  // Match information
  matchReport?: any;
  matchScore?: number;

  // Application details
  appliedAt: string;  // ISO timestamp
  appliedDate?: string;  // Legacy format
  appliedTime?: string;  // Legacy format

  // Q&A data (new format with user approval)
  questionAnswerPairs?: Array<{
    question: ApplicationQuestion;
    answer: Answer;
    userApproved: boolean;
    edited: boolean;
  }>;

  // Q&A data (legacy format)
  questions?: ApplicationQuestion[];
  answers?: Answer[];

  // Status tracking
  status: 'submitted' | 'applied' | 'interview' | 'rejected' | 'offer' | 'withdrawn';
  autoApplied?: boolean;

  // Additional fields
  salary?: string;
  notes?: string;
}

// Q&A pair for vector storage
export interface QAPair {
  id: string;
  question: string;
  answer: string;
  category?: string;
  keywords?: string[];
  usageCount?: number;
  lastUsed?: string;
}

// Configuration types
export interface AppConfig {
  anthropicApiKey: string;
  searchKeywords: string[];
  searchLocations: string[];
  searchPagesPerCombo: number;
  maxPagesToExtract: number; // -1 means extract all pages
  titleMatchThreshold: number;
  descriptionMatchThreshold: number;
  dateFilter: 'past_day' | 'past_week' | 'past_month' | 'any_time';
  searchRadius: number;
  remoteFilter: 'all' | 'no_remote' | 'only_remote';
  experienceLevel: 'all' | 'senior' | 'mid' | 'junior' | 'no_experience';
  maxApplicationsPerDay: number;
  minDelayBetweenAppsMs: number;
  maxDelayBetweenAppsMs: number;
  operationStartHour: number;
  operationEndHour: number;
  dryRun: boolean;
  chromaDbPath: string;
  chromaDbHost: string;
  chromaDbPort: number;
  headless: boolean;
  browserTimeout: number;
  usePersistentContext: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  logToFile: boolean;
  claudeModel: string;
  candidateExperienceYears: string;
  applicationMode: 'scrape' | 'interactive';
  autoApproveConfidence: number;
  minApplyScore: number;
}

// Browser session data
export interface SessionData {
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  savedAt: string;
  expiresAt?: string;
}

// Workflow state for LangGraph
export interface WorkflowState {
  jobs: JobListing[];
  currentJobIndex: number;
  matchedJobs: Array<JobListing & { matchReport: MatchReport }>;
  rejectedJobs: Array<JobListing & { reason: string }>;
  preparedApplications: PreparedApplication[];
  error?: string;
}

// Statistics and tracking
export interface ApplicationStats {
  totalApplications: number;
  applicationsToday: number;
  averageMatchScore: number;
  statusBreakdown: Record<string, number>;
  recentApplications: AppliedJob[];
}

// Rate limiting state
export interface RateLimitState {
  applicationsToday: number;
  lastApplicationTime?: number;
  nextAvailableTime?: number;
  dailyResetTime: number;
}

// Re-export interview API types
export * from './interviewAPI';
