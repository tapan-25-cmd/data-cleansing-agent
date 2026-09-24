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

export type ComparisonValues = {
  standard_size: string | null;
  standard_uom: string | null;
  standard_pack_size: string | null;
  total: string | null;
};

export type RunOutcome = {
  status: string;
  status_label: string;
  values: ComparisonValues;
  suggestion: ComparisonValues | null;
  comment: string;
};

export type ReviewerVerdict = "ACHIEVED" | "KEPT_UNDER_REVIEW" | "SUGGESTED" | "CONTRARY_PENDING" | "NOT_ACHIEVED" | "NOT_IN_RUN";

export type ComparisonRow = {
  row_number: number;
  item_no: string;
  group: string;
  group_label: string;
  product: string;
  product_local: string;
  uploaded: ComparisonValues;
  legacy: string | null;
  past: RunOutcome;
  new: RunOutcome;
  change: string;
  change_label: string;
  explanation: string;
  reviewer: {
    answer: string;
    basis: string;
    expected: ComparisonValues;
    past_verdict: ReviewerVerdict;
    new_verdict: ReviewerVerdict;
    past_verdict_label: string;
    new_verdict_label: string;
  } | null;
};

export type ReviewerCase = {
  item_no: string;
  product: string;
  row_number: number | null;
  answer: string;
  basis: string;
  expected: ComparisonValues;
  past: { verdict: ReviewerVerdict; verdict_label: string; status: string | null; values: ComparisonValues | null; suggestion: ComparisonValues | null };
  new: { verdict: ReviewerVerdict; verdict_label: string; status: string | null; values: ComparisonValues | null; suggestion: ComparisonValues | null };
};

export type JobCard = {
  job_id: string;
  created_at: string;
  status: string;
  file_name: string;
  engine: string | null;
  guards: string | null;
  prompt: string | null;
};

export type ComparisonBuilding = { status: "BUILDING"; past_job: JobCard; new_job: JobCard };

export type PastNewComparison = {
  status: "READY";
  version: string;
  mode: "JOB_VS_JOB";
  past_job: JobCard;
  new_job: JobCard;
  summary: {
    rows_compared: number;
    changed: number;
    missing_in_past: number;
    by_change: Record<string, number>;
    past_status: Record<string, number>;
    new_status: Record<string, number>;
  };
  change_labels: Record<string, string>;
  status_labels: Record<string, string>;
  reviewer: {
    version: string;
    reviewer: string;
    total: number;
    past: Record<ReviewerVerdict, number>;
    new: Record<ReviewerVerdict, number>;
    verdict_labels: Record<ReviewerVerdict, string>;
    cases: ReviewerCase[];
  };
  facets: Record<string, Record<string, number>>;
  rows: ComparisonRow[];
  total: number;
  page: number;
  page_size: number;
};

export const getPastNewComparison = (
  jobId: string,
  filters: Record<string, string>,
  page: number,
  changedOnly: boolean,
  pageSize = 50,
) => {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), changed_only: String(changedOnly) });
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return request<PastNewComparison | ComparisonBuilding>(`/api/jobs/${jobId}/comparison?${params}`);
};

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

// --- Open questions -------------------------------------------------------------
export type QuestionAnswer = { category: string; answer: string; note: string | null; answered_by: string | null; answered_at: string; job_id: string };
export type QuestionCategory = {
  id: string; group: string; kind: "REVIEW" | "NOTE" | "AUTO" | "BLANK"; name: string; rule: string; question: string;
  options: string[]; rows: number; statuses: Record<string, number>; answer: QuestionAnswer | null;
};
export type QuestionGroup = { id: string; title: string; rows: number; categories: QuestionCategory[] };
export type OpenQuestions = { version: string; rows_total: number; answered: number; groups: QuestionGroup[] };
export type QuestionOption = { label: string; values: ComparisonValues; text: string; source: string };
export type QuestionRow = {
  row_number: number; item_no: string; group: string; group_label: string; category: string; status: string; status_label: string;
  descriptions: Array<{ field: string; label: string; value: string | null }>;
  product: string; product_local: string;
  legacy: { text: string; converted: string | null } | null;
  excel: ComparisonValues; result: ComparisonValues; suggestion: ComparisonValues | null; comment: string;
  options: QuestionOption[];
  findings: Array<{ code: string; title: string; severity: string; message: string; evidence: Array<{ role: string; value: unknown }> }>;
};
export const getOpenQuestions = (jobId: string) => request<OpenQuestions>(`/api/jobs/${jobId}/open-questions`);
export const getOpenQuestionRows = (jobId: string, category: string, filters: Record<string, string>, page: number) => {
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return request<{ category: QuestionCategory; rows: QuestionRow[]; total: number; page: number; page_size: number }>(`/api/jobs/${jobId}/open-questions/${category}?${params}`);
};
export const answerOpenQuestion = (jobId: string, category: string, body: { answer: string; note?: string; answered_by?: string }) =>
  request<{ status: string }>(`/api/jobs/${jobId}/open-questions/${category}/answer`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// --- Rules guide ----------------------------------------------------------------
export type RulesGuide = {
  version: string;
  flow: Array<{ step: number; title: string; text: string; tab: string; steps?: string[] }>;
  labels: Record<string, string>;
  unit_mapping: { ruleset_version: string; rounding: string; rules: Array<{ rule_id: string; source_uoms: string[]; target_uom: string; factor: string; example: string; enabled: boolean; notes: string }>; readiness: { covered_source_uoms?: string[]; uncovered_source_uoms?: string[]; uncovered_affected_rows?: number } | null };
  legacy_checks: Array<{ order: number; outcome: string; rule: string; result: string; example: string }>;
  description_reading: { units: Array<{ written: string; means: string; counted_as: string; kind: string }>; pack_words: string[]; count_notations: Array<{ pattern: string; example: string; meaning: string }>; classifiers: string[]; numerals: Record<string, number>; pairs: Array<{ pair: string; english: string; local: string }>; brand_note: string; not_a_size: string[] };
  ai_rules: string[];
  guards: Array<{ code: string; meaning: string }>;
  category_profile: { validated_rows?: number; liquid_categories?: string[]; mixed_categories?: string[] } | null;
  pipeline: {
    nodes: Array<{ id: string; kind: "start" | "process" | "decision" | "lane" | "end" | "side"; title: string; summary: string; detail: string; steps?: string[]; inputs: string[]; outputs: string[]; count?: string; count_label?: string; rules_tab?: string }>;
    edges: Array<[string, string] | [string, string, string]>;
    labels: Array<{ label: string; status: string }>;
  };
  accuracy_method: Record<string, string[]>;
  reasoning: {
    status: string; status_text: string; what: string; sees: string[]; never_sees: string[]; returns: string[]; fixed_rules: string[];
    policy: Array<{ tier: string; when: string; today: string }>; safety_checks: string[]; gate: string[]; versions: Record<string, string>;
  };
  decisions: Array<{ id: string; title: string; text: string }>;
  business_decisions: { version: string; items: Array<{ id: string; title: string; status: string; decided_note: string | null }> };
  versions: Record<string, string | Record<string, string | null> | null>;
};
export const getRulesGuide = (jobId?: string) => request<RulesGuide>(`/api/rules${jobId ? `?job_id=${jobId}` : ""}`);

// --- Lane A reasoning (shadow trial) -------------------------------------------
export type ReasoningRow = {
  row_number: number; item_no: string; status: string; tier: "APPLY_CANDIDATE" | "SUGGEST" | "CANNOT_TELL"; guards: string[];
  agreement: string; engine_values: ComparisonValues; engine_suggestion: ComparisonValues | null;
  ai: { verdict: string; product_unit: string; values: ComparisonValues | null; explanation: string; confidence: "HIGH" | "MEDIUM" | "LOW"; needs_business_rule: boolean; business_rule_note: string | null; used_product_knowledge: string | null; evidence: Array<{ field: string; fragment: string }>; sources: Array<{ source: string; meaning: string; note: string }> } | null;
  expected: { verdict: string; values: ComparisonValues | null; score: string; note: string | null } | null;
  error?: string;
};
export type ReasoningSummary = { status: "NOT_RUN" } | { status: "READY"; job_id: string; run_id: string; prompt_version?: string; purpose?: string; summary: Record<string, unknown> & { rows: number; tiers?: Record<string, number>; agreement?: Record<string, number>; expected?: Record<string, number>; wrong_and_confident?: number; failed?: number; tokens?: { input: number; output: number } }; by_category?: Record<string, Record<string, number>>; by_cohort?: Record<string, Record<string, number>>; created_at?: string };
export const getReasoningSummary = (jobId: string) => request<ReasoningSummary>(`/api/jobs/${jobId}/reasoning`);
export const getReasoningRow = (jobId: string, row: number) => request<{ status: string; row: ReasoningRow | null }>(`/api/jobs/${jobId}/reasoning/${row}`);

// --- Accuracy for stakeholders --------------------------------------------------
export type AccuracyKind = "CONFIRMED" | "CONSISTENT" | "FLAG" | "ALARM" | "WRONG" | "UNVERIFIED";
export type AccuracySet = { id: string; kind: AccuracyKind; kind_label: string; name: string; reason: string; products: number };
export type AccuracyGroup = {
  group: string; products: number; scored: number; right: number; wrong: number; confirmed: number; consistent: number;
  flags: number; alarms: number; unverified: number; coverage_percent: number | null; accuracy_percent: number | null; confirmed_percent: number | null; sets: AccuracySet[];
};
export type ReadingTestAnchor = { job_id: string; finished_at: string | null; prompt_version: string | null; score: { tested: number; agreed: number; no_answer: number; verdicts: Record<string, number> } | null } | null;
export type AccuracyReport = { status: "BUILDING" } | { status: "FAILED"; error: string } | {
  status: "READY"; rebuilding?: boolean; version: string; built_at: string; reasoning_rows_used: number; reasoning_kept_rows_checked: number;
  disputed_a_rows: number; kind_labels: Record<AccuracyKind, string>; groups: AccuracyGroup[]; reading_test: ReadingTestAnchor;
};
export type AccuracySetRow = { row_number: number; item_no: string; group: string; product: string; product_local: string; legacy: string; status: string; status_label: string; values: ComparisonValues; suggestion: ComparisonValues | null; comment: string; witness: string };
export const getAccuracy = (jobId: string) => request<AccuracyReport>(`/api/jobs/${jobId}/accuracy`);
export const getAccuracySet = (jobId: string, setId: string, page: number) => request<{ set_id: string; rows: AccuracySetRow[]; total: number; page: number; page_size: number }>(`/api/jobs/${jobId}/accuracy/${setId}?page=${page}`);

// --- Blind tests ---------------------------------------------------------------
export type BlindMutation = { id: string; name: string; why: string; tested?: number; CAUGHT?: number; NOTED_ONLY?: number; MISSED?: number };
export type BlindTestDoc = { kind: string; status: "RUNNING" | "READY" | "FAILED"; error?: string; version?: string; started_at?: string; finished_at?: string; summary?: Record<string, unknown> };
export type BlindTests = {
  mutations: BlindMutation[];
  tests: Record<string, BlindTestDoc>;
  reading_test: { status: string | null; score: { tested: number; agreed: number; no_answer: number; verdicts: Record<string, number> } | null; prompt_version: string | null; finished_at: string | null } | null;
};
export const getBlindTests = (jobId: string) => request<BlindTests>(`/api/jobs/${jobId}/blind-test`);
export const runBlindTest = (jobId: string, kind: string) => request<{ status: string }>(`/api/jobs/${jobId}/blind-test/${kind}/run`, { method: "POST" });
export const getBlindTestRows = (jobId: string, kind: string, page: number) => request<{ rows: Array<Record<string, unknown>>; total: number; page: number; page_size: number }>(`/api/jobs/${jobId}/blind-test/${kind}/rows?page=${page}`);
