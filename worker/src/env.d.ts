interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  PROJECT_COORDINATOR: DurableObjectNamespace;
  TIMELINE_SESSION: DurableObjectNamespace;
  INGESTION_WORKFLOW: Workflow;
  PLAN_WORKFLOW: Workflow;
  TIMELINE_WORKFLOW: Workflow;
  REPLICATE_API_TOKEN?: string;
  GEMINI_API_KEY?: string;
}
