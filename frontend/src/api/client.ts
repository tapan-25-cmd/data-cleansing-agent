export type Stats = {
  workbook_rows?: number;
  department_rows?: number;
  purged?: number;
  live?: number;
  group_a?: number;
  group_b?: number;
  group_b1?: number;
  group_b2?: number;
  group_b3?: number;
  group_c?: number;
  validation_review?: number;
  group_a_validation_warnings?: number;
  data_shape_error?: number;
  discrepancies?: number;
  discrepancy_bilingual_measurement_conflicts?: number;
  discrepancy_bilingual_count_conflicts?: number;
  pack_existing_valid?: number;
  pack_normalized_existing?: number;
  pack_deterministic_proposed?: number;
  pack_agent_proposed?: number;
  pack_agent_declined?: number;
  pack_conflict?: number;
  pack_not_found?: number;
  pack_agent_error?: number;
  pack_agent_disabled?: number;
  pack_invalid_existing?: number;
};

export type Job = {
  job_id: string;
  original_file_name: string;
  status: string;
  stats: Stats;
  progress: { stage: string; processed: number; total: number; percent: number; unit?: "ROWS" | "AGENT_CALLS" };
  rule_readiness?: RuleReadiness;
  export_current?: boolean;
  error?: string;
};

export type RuleReadiness = {
  ruleset_version?: string;
  ruleset_checksum?: string;
  covered_source_uoms?: string[];
  uncovered_source_uoms?: string[];
  uncovered_affected_rows?: number;
};

export type JobItem = {
  row_number: number;
  item_no: string;
  department: string;
  group: string;
  context: Record<string, string | null>;
  original: Record<string, string | null>;
  field_proposals: Record<string, string | null>;
  method: string;
  reason_code: string;
  rule: Record<string, string | null>;
  evidence: Array<{ field: string; fragment: string }>;
  confidence: string | null;
  field_provenance?: Record<string, { method?: string; rule_id?: string; confidence?: string }>;
  pack_result?: { status?: string; reason_code?: string; pack_size?: string | null } | null;
  validation?: {
    status: string;
    issues: Array<{ code: string; field: string; severity: string; message: string }>;
    canonical_values: Record<string, string>;
  } | null;
  discrepancy: { version?: string; flagged: boolean; details: DiscrepancyDetail[] };
  review: { overall_status: string };
  findings?: Finding[];
  changes?: FieldChange[];
  application_policy?: string;
  // The one status shown to users; derived on the server for rows, counts and filters.
  status: string;
  result_ledger_version?: string;
};

export type DiscrepancySignal = {
  kind: "MEASUREMENT" | "COUNT";
  field: string;
  fragment: string;
  start: number;
  end: number;
  value: string | number;
};

export type DiscrepancyDetail = {
  scope: "BILINGUAL_PAIR";
  pair: "brand" | "item_desc" | "web_desc";
  aspect: "MEASUREMENT" | "COUNT";
  status: "CONFLICT" | "OBSERVATION" | "INSUFFICIENT";
  classification: string;
  left_signals: DiscrepancySignal[];
  right_signals: DiscrepancySignal[];
};

export type Finding = {
  code: string;
  category: string;
  severity: string;
  title: string;
  human_reason: string;
  field?: string | null;
  classification?: string | null;
  evidence?: Array<{ role: string; value: unknown; label?: string }>;
};

export type FieldChange = {
  field: string;
  original: unknown;
  proposed: unknown;
  final: unknown;
  action: string;
  method: string;
  rule_id?: string | null;
  confidence?: string | null;
};

export type ResultFacets = Record<string, Record<string, number>>;

export type EvaluationCatalog = {
  version: string;
  status: string;
  description: string;
  summary: {
    total_cases: number;
    approved_labels: number;
    proposed_labels: number;
    accuracy_available: boolean;
    approved_passed: number;
    proposed_behavior_matches: number;
    approved_accuracy_percent: number | null;
    accuracy_note: string;
    coverage: {
      deterministic_cases: number;
      adk_agent_cases: number;
      adk_agent_score_available: boolean;
      adk_agent_note: string;
    };
    business_decisions: Array<{
      id: string;
      item_no: string;
      scenario: string;
      source_columns: string[];
      decision: { title: string; reason: string; decision_needed: string };
    }>;
  };
  cases: Array<{
    id: string;
    item_no: string;
    scenario: string;
    category: string;
    execution_scope?: "DETERMINISTIC_RULE" | "ADK_AGENT";
    source_columns?: string[];
    plain_language?: {
      question: string;
      expected_result: string;
      business_decision?: { title: string; reason: string; decision_needed: string } | null;
    };
    input: Record<string, unknown>;
    expected: Record<string, unknown>;
    label_status: "APPROVED" | "PROPOSED";
    actual: {
      application_policy: string;
      finding_code: string | null;
      finding_codes: string[];
      proposed_standard_size: string | null;
    };
    passed: boolean;
  }>;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function uploadWorkbook(file: File): Promise<{ job_id: string }> {
  const body = new FormData();
  body.append("file", file);
  body.append("departments", "03_Grocery 2,06_Dairy & Frozen");
  return request("/api/jobs", { method: "POST", body });
}

export const startProcessing = (jobId: string) => request(`/api/jobs/${jobId}/process`, { method: "POST" });
export const getJob = (jobId: string) => request<Job>(`/api/jobs/${jobId}`);
export const getSummary = (jobId: string) => request<{ stats: Stats; pending_review: number; rule_readiness: RuleReadiness }>(`/api/jobs/${jobId}/summary`);
export const getItems = (
  jobId: string,
  group: string,
  page = 1,
  pageSize = 50,
  reviewStatus?: string,
  reasonCode?: string,
) => {
  const params = new URLSearchParams({ group, page: String(page), page_size: String(pageSize) });
  if (reviewStatus) params.set("review_status", reviewStatus);
  if (reasonCode) params.set("reason_code", reasonCode);
  return request<{ items: JobItem[]; total: number }>(`/api/jobs/${jobId}/items?${params}`);
};
export const getConversionGroups = (jobId: string) => request<{ groups: Array<Record<string, string | number>> }>(`/api/jobs/${jobId}/conversion-groups`);
export const approveGroup = (jobId: string, ruleId: string) => request(`/api/jobs/${jobId}/conversion-groups/${ruleId}/approve`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fields: ["standard_size", "standard_uom"] }),
});
export const decideItem = (
  jobId: string,
  row: number,
  action: "APPROVE" | "REJECT" | "OVERRIDE",
  values?: Record<string, string>,
  comment?: string,
) => request(`/api/jobs/${jobId}/items/${row}/decision`, {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, values, comment }),
});
export const createExport = (jobId: string) => request(`/api/jobs/${jobId}/export`, { method: "POST" });
export const sendChatMessage = (message: string) => request<{ intent: string; action: string | null; message: string }>("/api/chat/messages", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }),
});
export const getPreview = (jobId: string) => request<{ items: JobItem[] }>(`/api/jobs/${jobId}/preview?limit=9`);

export const getResults = (
  jobId: string,
  filters: Record<string, string>,
  page: number,
  pageSize = 50,
) => {
  const params = new URLSearchParams({ ...filters, page: String(page), page_size: String(pageSize) });
  Object.entries(filters).forEach(([key, value]) => { if (!value) params.delete(key); });
  return request<{ items: JobItem[]; total: number; page: number; page_size: number }>(
    `/api/jobs/${jobId}/results?${params}`,
  );
};
export const getResultFacets = (jobId: string) => request<{ facets: ResultFacets }>(`/api/jobs/${jobId}/result-facets`);
export const getResultItem = (jobId: string, row: number) => request<JobItem>(`/api/jobs/${jobId}/items/${row}`);
export const getLatestEvaluation = () => request<EvaluationCatalog>("/api/evaluations/latest");

export type QualityCapability = {
  key: string;
  capability: string;
  how_tested: string;
  state: "MEASURED" | "AWAITING_DECISION" | "NOT_MEASURED";
  tested: number;
  agreed: number;
  accuracy_percent: number | null;
  awaiting_decision: number;
  scored: number;
  correct: number;
  misses: number;
  data_problems: number;
  match_percent: number | null;
  no_answer: number;
  run?: { finished_at?: string; model_id?: string; prompt_version?: string; agent_version?: string; errors?: number } | null;
  confirmed_correct: number;
  confirmed_incorrect: number;
  available_to_test: number | null;
  examples: Array<{
    item_no: string;
    row_number: number;
    product: string;
    source: string;
    agent: string;
    excel: string;
    agrees: boolean;
    kind: string;
    verdict: string;
    note: string;
  }>;
};

export type QualityDecision = {
  id: string;
  title: string;
  why_it_matters: string;
  options: string[];
  unlocks: string;
  status: "OPEN" | "DECIDED";
  resolution: "AGENT_CORRECT" | "EXCEL_CORRECT" | null;
  decided_note: string | null;
  products_affected: number;
  example: string | null;
};

export type ResultAccuracyRow = {
  key: string;
  type: "ACTION" | "SUGGESTION";
  result: string;
  text_checkable: boolean;
  results: number;
  text_checked: number;
  text_confirmed: number;
  text_contradicted: number;
  verified: number;
  verified_correct: number;
  text_accuracy_percent: number | null;
  verified_accuracy_percent: number | null;
  accuracy_percent: number | null;
  basis: "REVIEWER" | "PRODUCT_TEXT" | null;
  examples: Array<{ item_no: string; product: string; before: string; legacy: string; result: string; text: string; confirmed: boolean; note: string }>;
};

export type VerificationSample = {
  kind: string;
  question: string;
  total_results: number;
  rows: Array<{
    row_number: number; item_no: string; descriptions: string[]; legacy: string;
    before: string; result: string; reason: string | null; verdict: "CORRECT" | "WRONG" | null;
  }>;
};

export const getVerificationSample = (jobId: string, kind: string, size = 30) =>
  request<VerificationSample>(`/api/jobs/${jobId}/verification-sample?kind=${kind}&size=${size}`);
export const verifyItem = (jobId: string, row: number, verdict: "CORRECT" | "WRONG" | null) =>
  request(`/api/jobs/${jobId}/items/${row}/verification`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verdict }),
  });

export type QualityReport = {
  version: string;
  dataset: { file_name?: string; departments: string[]; products: number };
  engine: {
    agent_version: string; prompt_version: string; ruleset_version: string | null;
    guards_version: string | null; processed_with_guards: boolean;
    ai_test_prompt_version: string | null; ai_test_is_current: boolean;
    liquid_categories: string[]; mixed_categories: string[];
  };
  safety_checks: Array<{ key: string; check: string; effect: string; products: number; example: string }>;
  ai_history: Array<{
    finished_at: string; mode: string; prompt_version: string | null; model_id: string | null;
    tested: number; same_answer: number; no_answer: number; differs: number; failed_calls: number;
    accuracy_percent: number | null; input_tokens: number; output_tokens: number;
  }>;
  result_accuracy: {
    rows: ResultAccuracyRow[];
    headline: {
      results: number; checked: number; correct: number; percent: number | null;
      basis: "REVIEWER" | "PRODUCT_TEXT" | null; text_checked: number; verified: number;
      min_verified_for_headline: number;
    };
  };
  accuracy: {
    checks: number; scored: number; correct: number; percent: number | null; misses: number;
    data_problems: number; awaiting_decision: number; bad_values_stopped: number;
    match_percent: number | null;
    breakdown: Array<{ verdict: string; what_happened: string; counts_as: string; products: number }>;
  };
  workload: Array<{ key: string; outcome: string; products: number; share_percent: number | null }>;
  capabilities: QualityCapability[];
  decisions: QualityDecision[];
};

export type AiReadingTest = {
  status: "NOT_STARTED" | "RUNNING" | "COMPLETED" | "FAILED";
  processed?: number;
  total?: number;
  available?: number;
  errors?: number;
  error?: string | null;
};

export const getAiReadingTest = (jobId: string) => request<AiReadingTest>(`/api/jobs/${jobId}/ai-reading-test`);
export const startAiReadingTest = (jobId: string, limit: number | null, onlyUnanswered = false) => request<AiReadingTest>(`/api/jobs/${jobId}/ai-reading-test`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit, only_unanswered: onlyUnanswered }),
});
export const getQuality = (jobId: string) => request<QualityReport>(`/api/jobs/${jobId}/quality`);

export type AgentEvaluationRun = {
  created_at?: string; cases_version: string; prompt_version: string | null; model_id: string | null;
  cases: number; passed: number; pass_percent: number | null; wrong_and_confident: number;
  failed_calls: number; tokens: number;
  patterns: Array<{ pattern: string; cases: number; passed: number; wrong_and_confident: number }>;
  rows: Array<{ id: string; pattern: string; item_no: string; text: string; expected: string; answer: string; passed: boolean; wrong_and_confident: boolean; rationale: string | null }>;
};
export const getAgentEvaluations = () => request<{ cases_version: string; cases: number; running: boolean; runs: AgentEvaluationRun[] }>("/api/evaluations/agent");
export const runAgentEvaluation = () => request("/api/evaluations/agent/run", { method: "POST" });
