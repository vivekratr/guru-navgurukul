export const COURSE_STATUSES = [
  "draft",
  "ingesting",
  "extracting_knowledge",
  "knowledge_extraction_failed",
  "generating_artifacts",
  "ready",
  "partially_ready",
] as const;

export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const SOURCE_STATUSES = [
  "pending",
  "processing",
  "done",
  "failed",
  "failed_permanent",
  "cancelled",
] as const;

export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const SOURCE_TYPES = ["text", "doc", "image", "video"] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

export type CourseListItem = {
  id: string;
  title: string;
  status: CourseStatus;
  updated_at: string;
};

export type CourseCreated = {
  id: string;
  title: string;
  status: CourseStatus;
  created_at: string;
};

export type CourseSource = {
  id: string;
  type: SourceType;
  status: SourceStatus;
  last_error: string | null;
};

export type CourseDetail = {
  id: string;
  title: string;
  status: CourseStatus;
  last_error: string | null;
  sources: CourseSource[];
  artifact_status: Record<string, string>;
};

export type SourceCreated = {
  id: string;
  type: SourceType;
  status: SourceStatus;
};

export type CourseModule = {
  position: number;
  title: string;
  paragraphs: string[];
};

export type ModulesResponse = {
  modules: CourseModule[];
};

/** API still serves /summary — response is learning modules */
export type SummaryResponse = ModulesResponse;

export type Flashcard = {
  id: string;
  concept_id: string | null;
  front: string;
  back: string;
};

export type FlashcardsResponse = {
  flashcards: Flashcard[];
};

export type ConceptGraphNode = {
  id: string;
  name: string;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
};

export type ConceptGraphEdge = {
  from: string;
  to: string;
  type: "contains" | "prerequisite" | "related";
};

export type ConceptGraphResponse = {
  nodes: ConceptGraphNode[];
  edges: ConceptGraphEdge[];
};

export type WorkerTickSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

export type PipelineTickResult = {
  ingest: WorkerTickSummary;
  knowledge: WorkerTickSummary;
  artifacts: WorkerTickSummary;
};
