/**
 * Core types for the agentic system
 */

import { Page } from 'playwright';

export type UIState = 
  | 'unknown'
  | 'login_page'
  | 'cloudflare_challenge'
  | 'job_search_page'
  | 'job_listing_page'
  | 'job_detail_page'
  | 'application_form'
  | 'application_submitted'
  | 'error_page';

export interface Observation {
  url: string;
  title: string;
  description: string;
  state: UIState;
  screenshot: Buffer;
  timestamp: number;
  elements?: DetectedElement[];
}

export interface DetectedElement {
  description: string;
  type: 'button' | 'input' | 'link' | 'text' | 'dropdown' | 'checkbox';
  coordinates?: { x: number; y: number };
  text?: string;
}

export interface Thought {
  analysis: string;
  reasoning: string;
  nextAction: ToolAction | null;
  goalAchieved: boolean;
  confidence: number;
}

export interface ToolAction {
  tool: string;
  params: Record<string, any>;
  reasoning: string;
}

export interface ToolResult {
  success: boolean;
  result?: any;
  error?: string;
  screenshot?: Buffer;
}

export interface Tool {
  name: string;
  description: string;
  parameters?: any; // Zod schema
  execute: (params: any, context: AgentContext) => Promise<ToolResult>;
}

export interface AgentContext {
  page: Page;
  memory: AgentMemory;
  observation: Observation;
  goal: string;
  iteration: number;
}

export interface AgentMemory {
  recentActions: MemoryEntry[];
  selectorCache: Map<string, CachedSelector>;
  episodes: Episode[];
}

export interface MemoryEntry {
  observation: Observation;
  thought: Thought;
  action: ToolAction;
  result: ToolResult;
  timestamp: number;
}

export interface CachedSelector {
  description: string;
  selector: string;
  successCount: number;
  failureCount: number;
  lastUsed: number;
  lastValidated: number;
}

export interface Episode {
  task: string;
  success: boolean;
  approach: string;
  duration: number;
  timestamp: number;
  learnings: string[];
}

export interface RecoveryStrategy {
  name: string;
  description: string;
  likelihood: number;
  execute: () => Promise<boolean>;
}

export interface ScreenAnalysis {
  description: string;
  uiState: UIState;
  interactiveElements: DetectedElement[];
  pageType: string;
  requiresAction: boolean;
  suggestedActions: string[];
}
