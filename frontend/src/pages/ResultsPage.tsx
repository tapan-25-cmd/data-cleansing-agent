import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { JobTabs } from "./JobTabs";
import { ReasoningSection } from "./ReasoningSection";
import {
  decideItem,
  getResultFacets,
  getResultItem,
  getResults,
  JobItem,
} from "../api/client";

const fieldLabels: Record<string, string> = {
  standard_size: "K · Standardize Unit Size",
  standard_uom: "L · Standardize UOM",
  standard_pack_size: "M · Standardize Pack Size",
};

function display(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function badgeClass(value: string) {
  return `result-badge badge-${value.toLowerCase().replaceAll("_", "-")}`;
}

const statusLabels: Record<string, { label: string; description: string }> = {
  NO_CHANGE: { label: "Already correct", description: "Checked and left exactly as it was in Excel." },
  AUTO_APPLY: { label: "Corrected automatically", description: "A confirmed rule fixed the value. The new value is in your download." },
  OBSERVATION_ONLY: { label: "Correct, with a note", description: "Left unchanged. A small difference was recorded for your information." },
  REVIEW_REQUIRED: { label: "Needs your review", description: "Sources disagree, so a person decides. Excel is unchanged until then." },
  UNRESOLVED: { label: "Could not determine", description: "Not enough information to work out a value. Left blank, never guessed." },
  SKIPPED: { label: "Skipped — purged", description: "A purged product with no details. It was not processed and is unchanged." },
};

function toneClass(value?: string) {
  return `tone-${(value || "NO_CHANGE").toLowerCase().replaceAll("_", "-")}`;
}

function statusLabel(value?: string) {
  return statusLabels[value || "NO_CHANGE"]?.label || display(value).replaceAll("_", " ");
}

const descriptionConflictCodes = ["BILINGUAL_DESCRIPTION_CONFLICT", "PACK_COUNT_CONFLICT"];

export function ResultsPage() {
  const { jobId = "" } = useParams();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    group: "",
    status: "",
    finding_category: "",
    finding_severity: "",
    review_status: "",
    changed_field: "",
  });

  useEffect(() => setPage(1), [filters]);
  const results = useQuery({
    queryKey: ["results", jobId, filters, page],
    queryFn: () => getResults(jobId, filters, page),
    enabled: Boolean(jobId),
  });
  const facets = useQuery({
    queryKey: ["result-facets", jobId],
    queryFn: () => getResultFacets(jobId),
    enabled: Boolean(jobId),
  });
  const detail = useQuery({
    queryKey: ["result-item", jobId, selectedRow],
    queryFn: () => getResultItem(jobId, selectedRow as number),
    enabled: selectedRow !== null,
  });
  const decision = useMutation({
    mutationFn: ({ row, action, values, comment }: {
      row: number;
      action: "APPROVE" | "REJECT" | "OVERRIDE";
      values?: Record<string, string>;
      comment?: string;
    }) => decideItem(jobId, row, action, values, comment),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["results", jobId] }),
        queryClient.invalidateQueries({ queryKey: ["result-item", jobId, selectedRow] }),
        queryClient.invalidateQueries({ queryKey: ["result-facets", jobId] }),
      ]);
    },
  });

  const updateFilter = (name: keyof typeof filters, value: string) => {
    setFilters(current => ({ ...current, [name]: value }));
  };
  const pageCount = Math.max(1, Math.ceil((results.data?.total || 0) / 50));
  const selected = detail.data;
  const outcomeCounts = facets.data?.facets.status || {};
  const totalRows = Object.values(outcomeCounts).reduce((total, value) => total + value, 0);
  const statusFilterOptions = Object.entries(statusLabels).filter(([value]) => (outcomeCounts[value] || 0) > 0);

  return <div className="results-page">
    <header className="results-header">
      <div>
        <p className="eyebrow">Cleansing result ledger</p>
        <h1>Workbook results</h1>
        <p>Every source row, decision, reason, and final K/L/M value in one auditable view.</p>
        <div className="ledger-header-metrics"><span><strong>{(results.data?.total || 0).toLocaleString()}</strong>rows in view</span><span><strong>{(outcomeCounts.AUTO_APPLY || 0).toLocaleString()}</strong>corrected automatically</span><span><strong>{(outcomeCounts.REVIEW_REQUIRED || 0).toLocaleString()}</strong>need your review</span></div>
      </div>
      <Link className="secondary" to="/">← Back to conversation</Link>
    </header>

    <JobTabs jobId={jobId} active="results" />

    <>
      <section className="outcome-overview" aria-label="Filter rows by status">
        <small>Status</small>
        <button className={`status-badge tone-all ${!filters.status ? "active" : ""}`} onClick={() => updateFilter("status", "")}>All rows <b>{totalRows.toLocaleString()}</b></button>
        {statusFilterOptions.map(([value, content]) => <button key={value} title={content.description} className={`status-badge ${toneClass(value)} ${filters.status === value ? "active" : ""}`} onClick={() => updateFilter("status", filters.status === value ? "" : value)}>{content.label} <b>{(outcomeCounts[value] || 0).toLocaleString()}</b></button>)}
      </section>
      <section className="result-filters" aria-label="Result filters">
        <input value={filters.search} onChange={event => updateFilter("search", event.target.value)} placeholder="Search item or description" />
        <select value={filters.group} onChange={event => updateFilter("group", event.target.value)}><option value="">All groups</option>{Object.entries(facets.data?.facets.group || {}).map(([value, count]) => <option key={value} value={value}>{value} ({count})</option>)}</select>
        <select value={filters.finding_category} onChange={event => updateFilter("finding_category", event.target.value)}><option value="">All issue categories</option>{Object.entries(facets.data?.facets.finding_category || {}).map(([value, count]) => <option key={value} value={value}>{value.replaceAll("_", " ")} ({count})</option>)}</select>
        <select value={filters.finding_severity} onChange={event => updateFilter("finding_severity", event.target.value)}><option value="">All severities</option>{Object.entries(facets.data?.facets.finding_severity || {}).map(([value, count]) => <option key={value} value={value}>{value} ({count})</option>)}</select>
        <select value={filters.changed_field} onChange={event => updateFilter("changed_field", event.target.value)}><option value="">All changed fields</option><option value="standard_size">K · Unit size</option><option value="standard_uom">L · UOM</option><option value="standard_pack_size">M · Pack size</option></select>
        <button className="secondary" onClick={() => setFilters({ search: "", group: "", status: "", finding_category: "", finding_severity: "", review_status: "", changed_field: "" })}>Clear</button>
      </section>

      <section className="ledger-shell">
        <div className="ledger-meta"><strong>{results.data?.total || 0} rows</strong><span>Page {page} of {pageCount}</span></div>
        <div className="ledger-table-wrap">
          <table className="ledger-table"><thead><tr><th>Item</th><th>Group</th><th>Status</th><th>K · Unit size</th><th>L · UOM</th><th>M · Pack size</th><th>Issue</th><th>Review</th></tr></thead><tbody>
            {results.isLoading && <tr><td colSpan={8}>Loading result rows…</td></tr>}
            {!results.isLoading && !results.data?.items.length && <tr><td colSpan={8}>No rows match these filters.</td></tr>}
            {results.data?.items.map(item => <tr key={item.row_number} onClick={() => setSelectedRow(item.row_number)} className={selectedRow === item.row_number ? "selected" : ""}>
              <td><strong>{item.item_no}</strong><small>Row {item.row_number}</small></td>
              <td><span className={`group-pill group-${item.group.toLowerCase()}`}>{item.group.length === 1 ? item.group : "!"}</span></td>
              <td><span className={`status-badge ${toneClass(item.status)}`}>{statusLabel(item.status)}</span></td>
              {(["standard_size", "standard_uom", "standard_pack_size"] as const).map(field => {
                const change = item.changes?.find(row => row.field === field);
                return <td key={field}><span className="ledger-value">{display(change?.final ?? item.original[field])}</span>{change?.proposed != null && <small>{display(change.original)} → {display(change.proposed)}</small>}</td>;
              })}
              <td>{item.findings?.[0] ? <><strong>{item.findings[0].title}</strong><small>{item.findings.length > 1 ? `+${item.findings.length - 1} more` : item.findings[0].category.replaceAll("_", " ")}</small></> : <span className="muted">No finding</span>}</td>
              <td>{display(item.review.overall_status).replaceAll("_", " ")}</td>
            </tr>)}
          </tbody></table>
        </div>
        <div className="ledger-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary" disabled={page >= pageCount} onClick={() => setPage(value => value + 1)}>Next</button></div>
      </section>
    </>

    {selectedRow !== null && <aside className="result-detail">
      <button className="detail-close" onClick={() => setSelectedRow(null)}>×</button>
      {detail.isLoading ? <p>Loading details…</p> : selected && <Detail jobId={jobId} item={selected} onDecision={(action, values, comment) => decision.mutate({ row: selected.row_number, action, values, comment })} pending={decision.isPending} />}
    </aside>}
  </div>;
}

function Detail({ jobId, item, onDecision, pending }: {
  jobId: string;
  item: JobItem;
  onDecision: (action: "APPROVE" | "REJECT" | "OVERRIDE", values?: Record<string, string>, comment?: string) => void;
  pending: boolean;
}) {
  const [showOverride, setShowOverride] = useState(false);
  const [overrideValues, setOverrideValues] = useState({ standard_size: "", standard_uom: "", standard_pack_size: "" });
  const [comment, setComment] = useState("");
  const submitOverride = (event: FormEvent) => {
    event.preventDefault();
    const values = Object.fromEntries(Object.entries(overrideValues).filter(([, value]) => value.trim()));
    if (!Object.keys(values).length) return;
    onDecision("OVERRIDE", values, comment.trim() || undefined);
  };
  const visibleFindings = (item.findings || []).filter((finding, index, rows) => rows.findIndex(candidate =>
    candidate.code === finding.code && JSON.stringify(candidate.evidence || []) === JSON.stringify(finding.evidence || [])
  ) === index);
  const noAgentProposal = item.group === "C" && !item.field_proposals.standard_size && !item.field_proposals.standard_uom;
  const sourceFields = [
    ["Brand (English)", item.context.item_brand_eng],
    ["Brand (local language)", item.context.item_brand_local_lang],
    ["Item description (English)", item.context.item_desc_eng],
    ["Item description (local language)", item.context.item_desc_local_lang],
    ["Web description (English)", item.context.web_description_eng],
    ["Web description (local language)", item.context.web_description_chi],
  ];
  const policy = item.status;
  const hasProposal = Object.values(item.field_proposals).some(value => value != null);
  const hasReviewExplanation = (item.findings || []).some(finding => [
    "LEGACY_UOM_MISMATCH",
    "SIGNIFICANT_LEGACY_SIZE_MISMATCH",
    "LINKED_SIZE_AND_PACK_SUGGESTION",
    "DESCRIPTION_PACK_COUNT_DIFFERS",
    "PACKAGING_HIERARCHY_AMBIGUOUS",
    ...descriptionConflictCodes,
  ].includes(finding.code));
  const reviewOpen = policy === "REVIEW_REQUIRED" && !["APPROVED", "REJECTED", "OVERRIDDEN"].includes(item.review.overall_status);
  return <div className="detail-content">
    <p className="eyebrow">Row {item.row_number}</p><h2>{item.item_no}</h2>
    <div className="detail-badges"><span className={`status-badge ${toneClass(policy)}`}>{statusLabel(policy)}</span><span className="result-badge">Group {item.group}</span></div>
    {!hasReviewExplanation && !noAgentProposal && <p className="status-explanation">{statusLabels[policy]?.description}</p>}
    <ReviewExplanation item={item} />
    {noAgentProposal && <section className="agent-abstention compact"><strong>No reliable measurement found</strong><p>The agent checked all permitted descriptions and safely left K/L/M blank instead of guessing.</p><span>Safe abstention · {display(item.reason_code).replaceAll("_", " ").toLowerCase()}</span></section>}

    <section className="klm-glance">
      <div className="klm-heading"><h3>K/L/M at a glance</h3><span>These are the values that matter for the download</span></div>
      <div className="klm-table"><div className="klm-table-head"><span>Field</span><span>Uploaded Excel</span><span>Suggested</span><span>Download</span></div>{item.changes?.map(change => <div className={change.proposed != null ? "has-proposal" : ""} key={change.field}><strong>{fieldLabels[change.field] || change.field}</strong><span>{display(change.original)}</span><span>{display(change.proposed)}</span><span>{display(change.final)}</span></div>)}</div>
    </section>

    <section className="detail-section">
      <div className="detail-section-heading"><h3>Source information checked</h3><span>{sourceFields.filter(([, value]) => value).length} provided · {sourceFields.filter(([, value]) => !value).length} missing</span></div>
      <div className="source-evidence-table">{sourceFields.map(([label, value]) => <div key={String(label)}><strong>{label}</strong><span className={!value ? "source-missing" : ""}>{value ? display(value) : "No value provided"}</span><small className={value ? "source-checked" : "source-empty"}>{value ? "Checked" : "Missing"}</small></div>)}</div>
    </section>

    <ReasoningSection jobId={jobId} row={item.row_number} />
    <section className="detail-section">
      <div className="detail-section-heading"><h3>Findings and evidence</h3><span>{visibleFindings.length} finding{visibleFindings.length === 1 ? "" : "s"}</span></div>
      <div className="detail-findings">{visibleFindings.length ? visibleFindings.map(finding => <article key={`${finding.code}-${finding.field}`}><span className={badgeClass(finding.severity)}>{finding.severity === "REVIEW" ? "Needs review" : finding.severity === "WARNING" ? "Please note" : "Information"}</span><strong>{finding.title}</strong><p>{finding.human_reason}</p>{finding.evidence?.map((evidence, index) => <EvidenceValue key={index} role={evidence.role} value={evidence.value} code={finding.code} label={evidence.label} />)}</article>) : noAgentProposal ? <p className="agent-no-evidence-finding"><strong>No explicit measurement evidence was found.</strong><span>The agent completed the check, but none of the available source fields contained a reliable size and UOM.</span></p> : <p className="muted">No additional findings. The existing Excel values passed the available checks.</p>}</div>
    </section>
    {reviewOpen && <>
      {showOverride && <form className="override-form" onSubmit={submitOverride}><h3>Human override</h3><div>{Object.entries(fieldLabels).map(([field, label]) => <label key={field}><span>{label}</span><input value={overrideValues[field as keyof typeof overrideValues]} onChange={event => setOverrideValues(current => ({ ...current, [field]: event.target.value }))} /></label>)}</div><label><span>Review comment</span><textarea value={comment} onChange={event => setComment(event.target.value)} /></label><button className="primary" disabled={pending || !Object.values(overrideValues).some(value => value.trim())}>Save override</button></form>}
      <div className="detail-actions"><button disabled={pending} className="secondary" onClick={() => onDecision("REJECT")}>Keep Excel values</button><button disabled={pending} className="secondary" onClick={() => setShowOverride(value => !value)}>Enter values</button>{hasProposal && <button disabled={pending} className="primary" onClick={() => onDecision("APPROVE")}>Use suggestion</button>}</div>
    </>}
  </div>;
}

function ReviewExplanation({ item }: { item: JobItem }) {
  const codes = new Set((item.findings || []).map(finding => finding.code));
  const legacySize = item.original.legacy_size;
  const legacyUom = item.original.legacy_uom;
  const existingSize = item.original.standard_size;
  const existingUom = item.original.standard_uom;
  const existingPack = item.original.standard_pack_size;
  if (codes.has("LEGACY_UOM_MISMATCH")) {
    return <section className="review-explanation">
      <p className="eyebrow">What needs attention</p>
      <h3>{display(legacySize)} {display(legacyUom)} in legacy conflicts with {display(existingSize)} {display(existingUom)} in Excel</h3>
      <div className="business-comparison"><span><small>Legacy source (I/J)</small><strong>{display(legacySize)} {display(legacyUom)}</strong></span><b>does not agree with</b><span><small>Existing Excel (K/L/M)</small><strong>{display(existingSize)} {display(existingUom)} × {display(existingPack)}</strong></span></div>
      <p className="decision-note"><strong>Why review?</strong> {display(legacyUom)} and {display(existingUom)} measure different things, so the system cannot safely convert them without product-specific evidence.</p>
    </section>;
  }
  if (codes.has("LINKED_SIZE_AND_PACK_SUGGESTION")) {
    const linked = (item.findings || []).find(finding => finding.code === "LINKED_SIZE_AND_PACK_SUGGESTION");
    const countEvidence = linked?.evidence?.find(row => row.role === "EXPECTED");
    const size = item.field_proposals.standard_size;
    const pack = item.field_proposals.standard_pack_size;
    return <section className="review-explanation">
      <p className="eyebrow">What needs attention</p>
      <h3>{display(existingSize)} {display(existingUom)} × {display(existingPack)} in Excel, or {display(size)} {display(existingUom)} × {display(pack)}? Same total, different split</h3>
      <div className="business-comparison three-way">
        <span><small>Legacy source (I/J)</small><strong>{display(legacySize)} {display(legacyUom)}</strong></span>
        <b>× count in description</b>
        <span><small>Description says</small><strong>{display(countEvidence?.value)}</strong></span>
        <b>=</b>
        <span><small>Suggested (K/L/M)</small><strong>{display(size)} {display(existingUom)} × {display(pack)}</strong></span>
      </div>
      <p className="decision-note"><strong>Decision:</strong> the total does not change. Approve if each pack is sold or consumed on its own, keep the Excel values if the whole item is the unit, or enter different values.</p>
    </section>;
  }
  if (codes.has("DESCRIPTION_PACK_COUNT_DIFFERS")) {
    const finding = (item.findings || []).find(f => f.code === "DESCRIPTION_PACK_COUNT_DIFFERS");
    const stated = finding?.evidence?.find(row => row.role === "EXPECTED");
    return <section className="review-explanation">
      <p className="eyebrow">What needs attention</p>
      <h3>The description counts differently from Excel's pack size {display(existingPack)}</h3>
      <div className="business-comparison"><span><small>Description says</small><strong>{display(stated?.value)}</strong></span><b>does not agree with</b><span><small>Existing Excel (K/L/M)</small><strong>{display(existingSize)} {display(existingUom)} × {display(existingPack)}</strong></span></div>
      <p className="decision-note"><strong>Why review?</strong> Nothing here says which one is current, so no value is suggested. Keep the Excel values or enter the confirmed pack size.</p>
    </section>;
  }
  if (codes.has("SIGNIFICANT_LEGACY_SIZE_MISMATCH")) {
    const proposed = item.field_proposals.standard_size;
    const converted = legacyUom && existingUom && legacyUom !== existingUom;
    return <section className="review-explanation">
      <p className="eyebrow">What needs attention</p>
      <h3>{display(existingSize)} {display(existingUom)} in Excel vs {display(proposed)} {display(existingUom)} from the conversion rule</h3>
      <div className={`business-comparison ${converted ? "three-way" : ""}`}>
        <span><small>Legacy source (I/J)</small><strong>{display(legacySize)} {display(legacyUom)}</strong></span>
        <b>{converted ? "converts to" : "compared with"}</b>
        {converted && <><span><small>Rule result</small><strong>{display(proposed)} {display(existingUom)}</strong></span><b>vs</b></>}
        <span><small>Existing Excel (K/L)</small><strong>{display(existingSize)} {display(existingUom)}</strong></span>
      </div>
      <p className="decision-note"><strong>Decision:</strong> approve the suggestion, keep the Excel value, or enter a different value. The download stays unchanged until you decide.</p>
    </section>;
  }
  if (codes.has("PACKAGING_HIERARCHY_AMBIGUOUS")) {
    return <section className="review-explanation"><p className="eyebrow">What needs attention</p><h3>The package wording supports more than one K/L/M result</h3><p className="decision-note">Open evidence only if needed, then keep the Excel values or enter the confirmed package interpretation.</p></section>;
  }
  const conflict = (item.findings || []).find(finding => descriptionConflictCodes.includes(finding.code));
  if (conflict) {
    const [left, right] = conflict.evidence || [];
    return <section className="review-explanation">
      <p className="eyebrow">What needs attention</p>
      <h3>{conflict.title}</h3>
      <div className="business-comparison"><span><small>{display(left?.label)}</small><strong>{display(left?.value)}</strong></span><b>does not agree with</b><span><small>{display(right?.label)}</small><strong>{display(right?.value)}</strong></span></div>
      <p className="decision-note"><strong>Why review?</strong> The system never picks a winner between conflicting descriptions. Keep the Excel values or enter the confirmed ones{conflict.classification === "LIKELY_TYPO" ? "; the two values look like a possible typing error" : ""}.</p>
    </section>;
  }
  return <></>;
}

function EvidenceValue({ role, value, code, label: providedLabel }: { role: string; value: unknown; code: string; label?: string }) {
  const label = providedLabel ? `${providedLabel} states` : code === "DESCRIPTION_MEASUREMENT_MISMATCH"
    ? (role === "CURRENT" ? "Description states" : "Existing Excel K/L")
    : code === "LEGACY_UOM_MISMATCH"
      ? (role === "CURRENT" ? "Existing Excel UOM" : "Legacy source UOM")
      : code === "SIGNIFICANT_LEGACY_SIZE_MISMATCH"
        ? (role === "CURRENT" ? "Existing Excel size" : "Legacy comparison size")
      : code === "LINKED_SIZE_AND_PACK_SUGGESTION"
        ? (role === "CURRENT" ? "Existing Excel K/L/M" : "Count in the description")
      : code === "DESCRIPTION_PACK_COUNT_DIFFERS"
        ? (role === "CURRENT" ? "Existing Excel pack size" : "Count in the description")
        : role === "CURRENT" ? "Evidence found" : "Interpretations checked";
  if (Array.isArray(value)) {
    return <div className="evidence-readable"><strong>{label}</strong><div className="interpretation-list">{value.map((candidate, index) => {
      const row = candidate as Record<string, unknown>;
      return <span key={index}>{display(row.interpretation).replaceAll("_", " ")}: K {display(row.standard_size)} · L {display(row.standard_uom)} · M {display(row.standard_pack_size)}</span>;
    })}</div></div>;
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    const candidates = Array.isArray(row.candidates) ? row.candidates : [];
    return <div className="evidence-readable"><strong>{label}</strong><p><b>{display(row.fragment)}</b> in {display(row.field).replaceAll("_", " ")}</p><p>Detected {row.outer_count ? `${row.outer_count} outer cases, ` : ""}{display(row.inner_count)} inner units at {display(row.measurement)} {display(row.standard_uom)}.</p>{candidates.length > 0 && <div className="interpretation-list">{candidates.map((candidate, index) => {
      const interpretation = candidate as Record<string, unknown>;
      return <span key={index}>{display(interpretation.interpretation).replaceAll("_", " ")}: K {display(interpretation.standard_size)} · L {display(interpretation.standard_uom)} · M {display(interpretation.standard_pack_size)}</span>;
    })}</div>}</div>;
  }
  return <div className="evidence-readable"><strong>{label}</strong><span>{display(value)}</span></div>;
}
