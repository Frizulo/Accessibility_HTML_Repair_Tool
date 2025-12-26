import { z } from "zod";

// Accessibility rule definition
export interface AccessibilityRule {
  id: string;
  wcagCode: string;
  taiwanCode: string;
  level: "A" | "AA" | "AAA";
  name: string;
  description: string;
  canAutoFix: boolean;
}

// Issue found during analysis
export interface AccessibilityIssue {
  ruleId: string;
  wcagCode: string;
  taiwanCode: string;
  level: "A" | "AA" | "AAA";
  message: string;
  line: number;
  column: number;
  startOffset: number;
  endOffset: number;
  originalSnippet: string;
  fixedSnippet?: string;
  autoFixed: boolean;
  needsManualReview: boolean;
  suggestion?: string;
}

// Repair result
export interface RepairResult {
  originalHtml: string;
  repairedHtml: string;
  issues: AccessibilityIssue[];
  summary: {
    totalIssues: number;
    autoFixed: number;
    needsManualReview: number;
  };
}

// API request/response schemas
export const repairRequestSchema = z.object({
  html: z.string().min(1, "HTML content is required"),
  template: z.string().optional(),
  apiKey: z.string().optional(),
  config: z.string().optional(), // JSON string for local rule options
});

export type RepairRequest = z.infer<typeof repairRequestSchema>;

// Rule categories for UI grouping
export type RuleCategory = 
  | "links" 
  | "images" 
  | "forms" 
  | "structure" 
  | "styles" 
  | "multimedia";

// Diff line types for visualization
export type DiffLineType = "unchanged" | "removed" | "added" | "modified" | "needs-review";

export interface DiffLine {
  type: DiffLineType;
  lineNumber: number;
  content: string;
  highlights?: Array<{
    start: number;
    end: number;
    type: "error" | "fix" | "review";
  }>;
}
