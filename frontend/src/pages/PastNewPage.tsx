import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { JobTabs } from "./JobTabs";
import { ReasoningSection } from "./ReasoningSection";
import {
  ComparisonRow,
  ComparisonValues,
  getPastNewComparison,
  groupTitle,
  ReviewerCase,
  ReviewerVerdict,
  RunOutcome,
} from "../api/client";

const changeOrder = [
  "REVIEW_CLEARED", "NOW_AUTOMATIC", "VALUES_CHANGED", "SUGGESTION_CHANGED",
  "NEW_REVIEW", "NOW_UNRESOLVED", "NOTE_CHANGED", "SAME",
];

const changeHelp: Record<string, string> = {
  SAME: "Both runs reached the same result for this row.",
  REVIEW_CLEARED: "The past run asked a person to check the row. The new run explains it and keeps the values.",
  NOW_AUTOMATIC: "The new run fills in the value by itself where the past run did not.",
  VALUES_CHANGED: "The workbook would carry different values after each run.",
  SUGGESTION_CHANGED: "Both runs ask for review but suggest different values.",
  NEW_REVIEW: "The new run found something a person should check that the past run missed.",
  NOW_UNRESOLVED: "The new run could not determine a value where the past run did.",
  NOTE_CHANGED: "Same values; only the note attached to the row changed.",
};

const verdictTone: Record<ReviewerVerdict, string> = {
  ACHIEVED: "tone-no-change",
  KEPT_UNDER_REVIEW: "tone-review-required",
  SUGGESTED: "tone-auto-apply",
  CONTRARY_PENDING: "tone-review-required",
  NOT_ACHIEVED: "tone-unresolved",
  NOT_IN_RUN: "tone-skipped",
};

function tone(value: string) {
  return `tone-${value.toLowerCase().replaceAll("_", "-")}`;
}

function values(value: ComparisonValues | null | undefined) {
  if (!value || (!value.standard_size && !value.standard_uom && !value.standard_pack_size)) return "blank";
  const unit = [value.standard_size, value.standard_uom].filter(Boolean).join(" ") || "no size";
  return value.standard_pack_size ? `${unit} × ${value.standard_pack_size}` : unit;
}

function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Outcome({ run }: { run: RunOutcome }) {
  return <div className="run-outcome">
    <span className={`status-badge ${tone(run.status)}`}>{run.status_label}</span>
    <strong>{values(run.values)}</strong>
    {run.suggestion && <small>Suggests {values(run.suggestion)}</small>}
  </div>;
}

export function PastNewPage() {
  const { jobId = "" } = useParams();
  const [page, setPage] = useState(1);
  const [changedOnly, setChangedOnly] = useState(true);
  const [showReviewer, setShowReviewer] = useState(true);
  const [selected, setSelected] = useState<ComparisonRow | null>(null);
  const [filters, setFilters] = useState({ change: "", past_status: "", new_status: "", group: "", search: "" });
  useEffect(() => setPage(1), [filters, changedOnly]);
  const comparison = useQuery({
    queryKey: ["past-new", jobId, filters, page, changedOnly],
    queryFn: () => getPastNewComparison(jobId, filters, page, changedOnly),
    enabled: Boolean(jobId),
    retry: false,
    refetchInterval: query => (query.state.data?.status === "BUILDING" ? 4000 : false),
  });
  const building = comparison.data?.status === "BUILDING" ? comparison.data : null;
  const report = comparison.data?.status === "READY" ? comparison.data : null;
  const pageCount = Math.max(1, Math.ceil((report?.total || 0) / 50));
  const update = (field: keyof typeof filters, value: string) =>
    setFilters(current => ({ ...current, [field]: value }));
  const pickChange = (value: string) => {
    if (value === "SAME") setChangedOnly(false);
    update("change", filters.change === value ? "" : value);
  };

  return <div className="results-page">
    <header className="results-header">
      <div>
        <p className="eyebrow">Past run vs new run</p>
        <h1>What changed between two runs</h1>
        <p>Every row of this workbook, side by side: what the previous run said and what the new run says. Nothing here changes either run.</p>
      </div>
      <Link className="secondary" to="/">← Back to conversation</Link>
    </header>

    <JobTabs jobId={jobId} active="comparison" />

    {comparison.isLoading && <section className="compare-loading"><span className="spinner" /><div><strong>Reading both runs</strong><p>Comparing every row of the previous run with the same row of this run. This takes a moment the first time.</p></div></section>}
    {comparison.isError && <div className="alert error">{comparison.error.message}</div>}
    {building && <section className="compare-loading"><span className="spinner" /><div><strong>Comparing the two runs</strong><p>Reading every row of the run from {when(building.past_job.created_at)} and the run from {when(building.new_job.created_at)}. This happens once and takes a few minutes; the page refreshes by itself.</p></div></section>}

    {report && <>
      <section className="compare-runs">
        <article><small>Past run</small><strong>{when(report.past_job.created_at)}</strong><span>{report.past_job.file_name}</span><span className="muted">{report.past_job.engine || "earlier engine"}</span></article>
        <div className="compare-arrow">→</div>
        <article className="new"><small>New run</small><strong>{when(report.new_job.created_at)}</strong><span>{report.new_job.file_name}</span><span className="muted">{report.new_job.engine || "current engine"}</span></article>
        <article className="headline"><small>Rows compared</small><strong>{report.summary.rows_compared.toLocaleString()}</strong><span>{report.summary.changed.toLocaleString()} rows changed · {(report.summary.rows_compared - report.summary.changed).toLocaleString()} identical</span></article>
      </section>

      <section className="outcome-overview" aria-label="Filter rows by what changed">
        <small>What changed</small>
        <button className={`status-badge tone-all ${!filters.change && changedOnly ? "active" : ""}`} onClick={() => { setChangedOnly(true); update("change", ""); }}>All changed rows <b>{report.summary.changed.toLocaleString()}</b></button>
        {changeOrder.filter(value => (report.summary.by_change[value] || 0) > 0).map(value => <button key={value} title={changeHelp[value]} className={`status-badge ${value === "SAME" ? "tone-skipped" : tone(value)} ${filters.change === value ? "active" : ""}`} onClick={() => pickChange(value)}>{report.change_labels[value]} <b>{(report.summary.by_change[value] || 0).toLocaleString()}</b></button>)}
      </section>

      <section className="compare-status-shift">
        <table>
          <thead><tr><th>Result</th><th>Past run</th><th>New run</th><th>Difference</th></tr></thead>
          <tbody>
            {Object.entries(report.status_labels).filter(([status]) => status !== "SKIPPED").map(([status, label]) => {
              const before = report.summary.past_status[status] || 0;
              const after = report.summary.new_status[status] || 0;
              const delta = after - before;
              return <tr key={status}><td><span className={`status-badge ${tone(status)}`}>{label}</span></td><td>{before.toLocaleString()}</td><td>{after.toLocaleString()}</td><td className={delta === 0 ? "muted" : delta < 0 ? "down" : "up"}>{delta === 0 ? "no change" : `${delta > 0 ? "+" : ""}${delta.toLocaleString()}`}</td></tr>;
            })}
          </tbody>
        </table>
      </section>

      <section className="reviewer-panel">
        <header>
          <div>
            <h2>Answers confirmed by the reviewer</h2>
            <p>{report.reviewer.reviewer}. For each product, the answer the reviewer accepts as right, and whether each run reaches it.</p>
          </div>
          <div className="reviewer-score">
            <span className="status-badge tone-skipped">Past <b>{report.reviewer.past.ACHIEVED} of {report.reviewer.total}</b></span>
            <span className="status-badge tone-no-change">New <b>{report.reviewer.new.ACHIEVED} of {report.reviewer.total}</b></span>
            <button className="secondary" onClick={() => setShowReviewer(value => !value)}>{showReviewer ? "Hide" : "Show"}</button>
          </div>
        </header>
        {showReviewer && <div className="ledger-table-wrap"><table className="ledger-table reviewer-table"><thead><tr><th>Product</th><th>Reviewer's answer</th><th>Past run</th><th>New run</th></tr></thead><tbody>
          {report.reviewer.cases.map(item => <ReviewerRow key={item.item_no} item={item} />)}
        </tbody></table></div>}
        {showReviewer && <p className="reviewer-legend">
          <span className={`status-badge ${verdictTone.ACHIEVED}`}>Matches</span> the workbook carries the reviewer's value and nothing contradicts it ·{" "}
          <span className={`status-badge ${verdictTone.KEPT_UNDER_REVIEW}`}>Kept, under review</span> the reviewer's value is in the workbook, but the row still asks a person to confirm it ·{" "}
          <span className={`status-badge ${verdictTone.SUGGESTED}`}>Suggested</span> the reviewer's value is proposed and waits for approval ·{" "}
          <span className={`status-badge ${verdictTone.CONTRARY_PENDING}`}>Wrong suggestion pending</span> the right value is kept, but a different suggestion still waits for review ·{" "}
          <span className={`status-badge ${verdictTone.NOT_ACHIEVED}`}>Not reached</span> the reviewer's value is neither carried nor suggested
        </p>}
      </section>

      <section className="result-filters" aria-label="Comparison filters">
        <input value={filters.search} onChange={event => update("search", event.target.value)} placeholder="Search item number or description" />
        <select value={filters.past_status} onChange={event => update("past_status", event.target.value)}><option value="">Past run: any result</option>{Object.entries(report.facets.past_status || {}).map(([value, count]) => <option key={value} value={value}>{report.status_labels[value] || value} ({count.toLocaleString()})</option>)}</select>
        <select value={filters.new_status} onChange={event => update("new_status", event.target.value)}><option value="">New run: any result</option>{Object.entries(report.facets.new_status || {}).map(([value, count]) => <option key={value} value={value}>{report.status_labels[value] || value} ({count.toLocaleString()})</option>)}</select>
        <select value={filters.group} onChange={event => update("group", event.target.value)}><option value="">New run: any group</option>{Object.entries(report.facets.group || {}).map(([value, count]) => <option key={value} value={value}>{groupTitle(value)} ({count.toLocaleString()})</option>)}</select>
        <label className="toggle"><input type="checkbox" checked={!changedOnly} onChange={event => setChangedOnly(!event.target.checked)} /> Show all {report.summary.rows_compared.toLocaleString()} rows</label>
        <button className="secondary" onClick={() => { setFilters({ change: "", past_status: "", new_status: "", group: "", search: "" }); setChangedOnly(true); }}>Clear</button>
      </section>

      <section className="ledger-shell">
        <div className="ledger-meta"><strong>{report.total.toLocaleString()} rows in view</strong><span>Page {page} of {pageCount}</span></div>
        <div className="ledger-table-wrap"><table className="ledger-table compare-table"><thead><tr><th>Product</th><th>Past run said</th><th>New run says</th><th>What changed</th></tr></thead><tbody>
          {report.rows.map(row => <tr key={row.row_number} onClick={() => setSelected(row)} className={selected?.row_number === row.row_number ? "selected" : ""}>
            <td><strong>{row.item_no}</strong><span>{row.product || row.product_local || "No description"}</span><small>Excel row {row.row_number} · {row.past_group === row.group ? `Group ${row.group_label}` : `Group ${row.past_group_label} → ${row.group_label}`}{row.reviewer ? " · reviewer case" : ""}</small></td>
            <td><Outcome run={row.past} /></td>
            <td><Outcome run={row.new} /></td>
            <td><span className={`status-badge ${row.change === "SAME" ? "tone-skipped" : tone(row.change)}`}>{row.change_label}</span><small>{row.explanation}</small></td>
          </tr>)}
          {!report.rows.length && <tr><td colSpan={4}>No rows match these filters.</td></tr>}
        </tbody></table></div>
        <div className="ledger-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary" disabled={page >= pageCount} onClick={() => setPage(value => value + 1)}>Next</button></div>
      </section>
    </>}

    {selected && <aside className="result-detail">
      <button className="detail-close" onClick={() => setSelected(null)}>×</button>
      <div className="detail-content">
        <p className="eyebrow">Row {selected.row_number}</p><h2>{selected.item_no}</h2>
        <div className="detail-badges"><span className={`status-badge ${selected.change === "SAME" ? "tone-skipped" : tone(selected.change)}`}>{selected.change_label}</span><span className="result-badge">{selected.past_group === selected.group ? groupTitle(selected.group) : `Group ${selected.past_group_label} → ${selected.group_label}`}</span><span className="result-badge">{selected.route_label}</span></div>

        <section className="review-explanation">
          <p className="eyebrow">What changed</p>
          <h3>{selected.product || selected.product_local || "No description"}</h3>
          <p>{selected.explanation}</p>
        </section>

        <section className="klm-glance">
          <div className="klm-heading"><h3>Values</h3><span>Unit size, pack and total</span></div>
          <div className="klm-table option-table">
            <div className="klm-table-head"><span>Reading</span><span>Unit size</span><span>Pack</span><span>Total</span></div>
            <ValueRow label="Uploaded in Excel" value={selected.uploaded} />
            {selected.legacy && <div><strong>Legacy value (I/J)</strong><span>{selected.legacy}</span><span>—</span><span>—</span></div>}
            <ValueRow label="After the past run" value={selected.past.values} />
            {selected.past.suggestion && <ValueRow label="Past run suggested" value={selected.past.suggestion} highlight />}
            <ValueRow label="After the new run" value={selected.new.values} />
            {selected.new.suggestion && <ValueRow label="New run suggests" value={selected.new.suggestion} highlight />}
          </div>
        </section>

        <ReasoningSection jobId={jobId} row={selected.row_number} />
        <section className="detail-section">
          <div className="detail-section-heading"><h3>Past run said</h3><span className={`status-badge ${tone(selected.past.status)}`}>{selected.past.status_label}</span></div>
          <div className="detail-findings"><article><p>{selected.past.comment}</p></article></div>
        </section>
        <section className="detail-section">
          <div className="detail-section-heading"><h3>New run says</h3><span className={`status-badge ${tone(selected.new.status)}`}>{selected.new.status_label}</span></div>
          <div className="detail-findings"><article><p>{selected.new.comment}</p></article></div>
        </section>

        {selected.reviewer && <section className="detail-section">
          <div className="detail-section-heading"><h3>Reviewer's answer</h3><span>{selected.reviewer.basis.toLowerCase()} evidence</span></div>
          <div className="detail-findings"><article><strong>{values(selected.reviewer.expected)}</strong><p>{selected.reviewer.answer}</p><div className="detail-badges"><span className={`status-badge ${verdictTone[selected.reviewer.past_verdict]}`}>Past: {selected.reviewer.past_verdict_label}</span><span className={`status-badge ${verdictTone[selected.reviewer.new_verdict]}`}>New: {selected.reviewer.new_verdict_label}</span></div></article></div>
        </section>}
      </div>
    </aside>}
  </div>;
}

function ReviewerRow({ item }: { item: ReviewerCase }) {
  return <tr>
    <td><strong>{item.item_no}</strong><span>{item.product || "Not in this workbook"}</span></td>
    <td><strong>{values(item.expected)}</strong><small>{item.answer}</small></td>
    <td><span className={`status-badge ${verdictTone[item.past.verdict]}`}>{item.past.verdict_label}</span>{item.past.values && <small>Carries {values(item.past.values)}{item.past.suggestion ? `, suggests ${values(item.past.suggestion)}` : ""}</small>}</td>
    <td><span className={`status-badge ${verdictTone[item.new.verdict]}`}>{item.new.verdict_label}</span>{item.new.values && <small>Carries {values(item.new.values)}{item.new.suggestion ? `, suggests ${values(item.new.suggestion)}` : ""}</small>}</td>
  </tr>;
}

function ValueRow({ label, value, highlight }: { label: string; value: ComparisonValues; highlight?: boolean }) {
  return <div className={highlight ? "has-proposal" : ""}><strong>{label}</strong><span>{[value.standard_size, value.standard_uom].filter(Boolean).join(" ") || "—"}</span><span>{value.standard_pack_size || "—"}</span><span>{value.total ? `${value.total} ${value.standard_uom || ""}` : "—"}</span></div>;
}
