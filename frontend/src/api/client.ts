export type Stats = {
  workbook_rows?: number;
  department_rows?: number;
  purged?: number;
  live?: number;
  group_a?: number;
  group_b?: number;
  group_b1?: number;
  group_b2?: number;
  group_c?: number;
  discrepancies?: number;
};

export type Job = {
  job_id: string;
  original_file_name: string;
  status: string;
  stats: Stats;
  progress: { stage: string; processed: number; total: number; percent: number };
  rule_readiness?: RuleReadiness;
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
  discrepancy: { flagged: boolean; details: unknown[] };
  review: { overall_status: string };
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
export const decideItem = (jobId: string, row: number, action: "APPROVE" | "REJECT") => request(`/api/jobs/${jobId}/items/${row}/decision`, {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
});
export const createExport = (jobId: string) => request(`/api/jobs/${jobId}/export`, { method: "POST" });
export const sendChatMessage = (message: string) => request<{ intent: string; action: string | null; message: string }>("/api/chat/messages", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }),
});
export const getPreview = (jobId: string) => request<{ items: JobItem[] }>(`/api/jobs/${jobId}/preview?limit=9`);
