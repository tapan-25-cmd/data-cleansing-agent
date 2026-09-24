import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { answerOpenQuestion, ComparisonValues, getOpenQuestionRows, getOpenQuestions, getReasoningSummary, QuestionCategory, QuestionRow } from "../api/client";
import { JobTabs } from "./JobTabs";
import { ReasoningSection } from "./ReasoningSection";

const kindLabels: Record<string, string> = { REVIEW: "A person decides", NOTE: "Nothing changed, rule explained", AUTO: "Changed automatically", BLANK: "Left blank on purpose" };
const kindTone: Record<string, string> = { REVIEW: "tone-review-required", NOTE: "tone-observation-only", AUTO: "tone-auto-apply", BLANK: "tone-unresolved" };

function tone(value: string) { return `tone-${value.toLowerCase().replaceAll("_", "-")}`; }
function values(value: ComparisonValues | null | undefined) {
  if (!value || (!value.standard_size && !value.standard_uom && !value.standard_pack_size)) return "blank";
  const unit = [value.standard_size, value.standard_uom].filter(Boolean).join(" ") || "no size";
  return value.standard_pack_size ? `${unit} × ${value.standard_pack_size}` : unit;
}
function total(value: ComparisonValues | null | undefined) { return value?.total ? `total ${value.total} ${value.standard_uom || ""}` : ""; }

export function OpenQuestionsPage() {
  const { jobId = "" } = useParams();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<string>("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: "", group: "", status: "" });
  const [selected, setSelected] = useState<QuestionRow | null>(null);
  useEffect(() => { setPage(1); setSelected(null); }, [category, filters]);
  const summary = useQuery({ queryKey: ["open-questions", jobId], queryFn: () => getOpenQuestions(jobId), enabled: Boolean(jobId) });
  const reasoning = useQuery({ queryKey: ["reasoning", jobId], queryFn: () => getReasoningSummary(jobId), enabled: Boolean(jobId) });
  const byCategory = reasoning.data?.status === "READY" ? reasoning.data.by_category || {} : null;
  const rows = useQuery({
    queryKey: ["open-question-rows", jobId, category, filters, page],
    queryFn: () => getOpenQuestionRows(jobId, category, filters, page),
    enabled: Boolean(jobId && category),
  });
  const current = summary.data?.groups.flatMap(g => g.categories).find(c => c.id === category) || null;
  const pageCount = Math.max(1, Math.ceil((rows.data?.total || 0) / 50));

  return <div className="results-page">
    <header className="results-header">
      <div>
        <p className="eyebrow">Open questions</p>
        <h1>Every row that needs a decision or an explanation</h1>
        <p>Each row that is not simply "already correct" is placed in one category. Answer the category, not the row. Nothing here changes the workbook.</p>
      </div>
      <Link className="secondary" to="/">← Back to conversation</Link>
    </header>
    <JobTabs jobId={jobId} active="questions" />

    {summary.isLoading && <section className="compare-loading"><span className="spinner" /><div><strong>Grouping the rows</strong><p>Reading every row that needs attention.</p></div></section>}
    {summary.isError && <div className="alert error">{summary.error.message}</div>}

    {summary.data && !category && <>
      <section className="outcome-overview" aria-label="Totals">
        <small>In this workbook</small>
        <span className="status-badge tone-all">Rows to look at <b>{summary.data.rows_total.toLocaleString()}</b></span>
        {Object.entries(kindLabels).map(([kind, label]) => {
          const count = summary.data!.groups.flatMap(g => g.categories).filter(c => c.kind === kind).reduce((n, c) => n + c.rows, 0);
          return count ? <span key={kind} className={`status-badge ${kindTone[kind]}`}>{label} <b>{count.toLocaleString()}</b></span> : null;
        })}
        <span className="status-badge tone-no-change">Categories answered <b>{summary.data.answered}</b></span>
      </section>
      {byCategory && <p className="source-help">The "AI reasoning (trial)" column shows what a reasoning pass would do with each category's rows: <em>could apply</em> when the text states the deciding fact, <em>suggests</em> when the answer needs a person or a business rule, <em>cannot tell</em> when the descriptions are silent. Trial only; nothing is applied.</p>}
      {summary.data.groups.filter(g => g.rows > 0).map(group => <section key={group.id} className="ledger-shell question-group">
        <div className="ledger-meta"><strong>{group.title}</strong><span>{group.rows.toLocaleString()} rows · {group.categories.filter(c => c.rows > 0).length} categories</span></div>
        <div className="ledger-table-wrap"><table className="ledger-table question-table"><thead><tr><th>Category</th><th>Kind</th><th>Rows</th><th>The question</th>{byCategory && <th>AI reasoning (trial)</th>}<th>Answer</th></tr></thead><tbody>
          {group.categories.filter(c => c.rows > 0).map(c => <tr key={c.id} onClick={() => setCategory(c.id)}>
            <td><strong>{c.name}</strong><small>{c.rule}</small></td>
            <td><span className={`status-badge ${kindTone[c.kind]}`}>{kindLabels[c.kind]}</span></td>
            <td className="num">{c.rows.toLocaleString()}</td>
            <td>{c.question}</td>
            {byCategory && <td className="reasoning-cell">{byCategory[c.id] ? <>
              {byCategory[c.id].APPLY_CANDIDATE ? <span className="status-badge tone-auto-apply">Could apply <b>{byCategory[c.id].APPLY_CANDIDATE}</b></span> : null}
              {byCategory[c.id].SUGGEST ? <span className="status-badge tone-review-required">Suggests <b>{byCategory[c.id].SUGGEST}</b></span> : null}
              {byCategory[c.id].CANNOT_TELL ? <span className="status-badge tone-unresolved">Cannot tell <b>{byCategory[c.id].CANNOT_TELL}</b></span> : null}
            </> : <span className="muted">not run</span>}</td>}
            <td>{c.answer ? <span className="status-badge tone-no-change">{c.answer.answer}</span> : <span className="muted">Open</span>}</td>
          </tr>)}
        </tbody></table></div>
      </section>)}
    </>}

    {current && <>
      <section className="question-head">
        <div>
          <button className="secondary" onClick={() => setCategory("")}>← All categories</button>
          <div className="detail-badges"><span className={`status-badge ${kindTone[current.kind]}`}>{kindLabels[current.kind]}</span><span className="result-badge">{current.rows.toLocaleString()} rows</span></div>
          <h2>{current.name}</h2>
          <div className="question-copy"><p><strong>The rule</strong>{current.rule}</p><p><strong>The question</strong>{current.question}</p></div>
        </div>
        <AnswerBox jobId={jobId} category={current} onSaved={() => queryClient.invalidateQueries({ queryKey: ["open-questions", jobId] })} />
      </section>
      <section className="result-filters" aria-label="Row filters">
        <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} placeholder="Search item number or description" />
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}><option value="">Any result</option>{Object.entries(current.statuses).map(([s, n]) => <option key={s} value={s}>{s.replaceAll("_", " ").toLowerCase()} ({n})</option>)}</select>
        <select value={filters.group} onChange={e => setFilters(f => ({ ...f, group: e.target.value }))}><option value="">All groups</option>{["A", "B", "C", "VALIDATION_REVIEW"].map(g => <option key={g} value={g}>Group {g === "VALIDATION_REVIEW" ? "A (disputed)" : g}</option>)}</select>
        <button className="secondary" onClick={() => setFilters({ search: "", group: "", status: "" })}>Clear</button>
      </section>
      <section className="ledger-shell">
        <div className="ledger-meta"><strong>{(rows.data?.total || 0).toLocaleString()} rows</strong><span>Page {page} of {pageCount}</span></div>
        <div className="ledger-table-wrap"><table className="ledger-table question-rows"><thead><tr><th>Product</th><th>Descriptions</th><th>Legacy (I/J)</th><th>Excel (K/L/M)</th><th>Suggested</th><th>What the engine found</th></tr></thead><tbody>
          {(rows.data?.rows || []).map(row => <tr key={row.row_number} onClick={() => setSelected(row)} className={selected?.row_number === row.row_number ? "selected" : ""}>
            <td><strong>{row.item_no}</strong><small>Excel row {row.row_number} · Group {row.group_label}</small><span className={`status-badge ${tone(row.status)}`}>{row.status_label}</span></td>
            <td className="descriptions"><span>{row.product || "—"}</span><span>{row.product_local || "—"}</span></td>
            <td><strong>{row.legacy?.text || "—"}</strong>{row.legacy?.converted && row.legacy.converted !== row.legacy.text && <small>= {row.legacy.converted}</small>}</td>
            <td><strong>{values(row.excel)}</strong><small>{total(row.excel)}</small></td>
            <td>{row.suggestion ? <><strong>{values(row.suggestion)}</strong><small>{total(row.suggestion)}</small></> : row.status === "AUTO_APPLY" ? <><strong>{values(row.result)}</strong><small>applied</small></> : <span className="muted">none</span>}</td>
            <td className="comment">{row.comment}</td>
          </tr>)}
          {rows.data && !rows.data.rows.length && <tr><td colSpan={6}>No rows match.</td></tr>}
        </tbody></table></div>
        <div className="ledger-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><button className="secondary" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</button></div>
      </section>
    </>}

    {selected && <aside className="result-detail">
      <button className="detail-close" onClick={() => setSelected(null)}>×</button>
      <div className="detail-content">
        <p className="eyebrow">Row {selected.row_number}</p><h2>{selected.item_no}</h2>
        <div className="detail-badges"><span className={`status-badge ${tone(selected.status)}`}>{selected.status_label}</span><span className="result-badge">Group {selected.group_label}</span>{current && <span className="result-badge">{current.name}</span>}</div>

        <section className="review-explanation">
          <p className="eyebrow">What the engine found</p>
          <h3>{selected.product || selected.product_local || "No description"}</h3>
          <p>{selected.comment}</p>
          {current && <p className="decision-note"><strong>Question for this category:</strong> {current.question}</p>}
        </section>

        <section className="klm-glance">
          <div className="klm-heading"><h3>This or this</h3><span>Each reading with its total</span></div>
          <div className="klm-table option-table">
            <div className="klm-table-head"><span>Reading</span><span>Unit size</span><span>Pack</span><span>Total</span></div>
            {selected.options.map(o => <div key={o.label} className={o.source === "SUGGESTION" ? "has-proposal" : ""}><strong>{o.label}</strong><span>{[o.values.standard_size, o.values.standard_uom].filter(Boolean).join(" ") || "—"}</span><span>{o.values.standard_pack_size || "—"}</span><span>{o.values.total ? `${o.values.total} ${o.values.standard_uom || ""}` : "—"}</span></div>)}
            {selected.legacy && <div><strong>Legacy value (I/J)</strong><span>{selected.legacy.text}</span><span>—</span><span className="muted">{selected.legacy.converted ? `= ${selected.legacy.converted}` : "no agreed conversion"}</span></div>}
          </div>
        </section>

        <section className="detail-section">
          <div className="detail-section-heading"><h3>Source information</h3><span>{selected.descriptions.filter(d => d.value).length} provided · {selected.descriptions.filter(d => !d.value).length} missing</span></div>
          <div className="source-evidence-table">{selected.descriptions.map(d => <div key={d.field}><strong>{d.label}</strong><span className={!d.value ? "source-missing" : ""}>{d.value || "No value provided"}</span><small className={d.value ? "source-checked" : "source-empty"}>{d.value ? "Read" : "Missing"}</small></div>)}</div>
        </section>

        <ReasoningSection jobId={jobId} row={selected.row_number} />
        <section className="detail-section">
          <div className="detail-section-heading"><h3>Findings and evidence</h3><span>{selected.findings.length} finding{selected.findings.length === 1 ? "" : "s"}</span></div>
          <div className="detail-findings">{selected.findings.map((f, i) => <article key={i}><span className={`result-badge badge-${String(f.severity || "info").toLowerCase()}`}>{String(f.severity || "info").toLowerCase()}</span><strong>{f.title}</strong><p>{f.message}</p>{f.evidence.map((e, j) => <div className="evidence-readable" key={j}><strong>{e.role === "CURRENT" ? "Existing value" : "Found in the text"}</strong><span>{String(e.value)}</span></div>)}</article>)}
          {!selected.findings.length && <p className="source-help">No finding is attached to this row.</p>}</div>
        </section>
      </div>
    </aside>}
  </div>;
}

function AnswerBox({ jobId, category, onSaved }: { jobId: string; category: QuestionCategory; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState(category.answer?.answer || "");
  const [note, setNote] = useState(category.answer?.note || "");
  const [by, setBy] = useState(category.answer?.answered_by || "");
  const save = useMutation({ mutationFn: () => answerOpenQuestion(jobId, category.id, { answer, note, answered_by: by }), onSuccess: () => { setOpen(false); onSaved(); } });
  const submit = (e: FormEvent) => { e.preventDefault(); if (answer.trim()) save.mutate(); };
  return <div className="answer-box">
    {category.answer && !open && <div className="answer-recorded"><span className="status-badge tone-no-change">Answered: {category.answer.answer}</span><small>{category.answer.answered_by || "unknown"} · {new Date(category.answer.answered_at).toLocaleDateString()}</small>{category.answer.note && <p>{category.answer.note}</p>}</div>}
    {!open && <button className="secondary" onClick={() => setOpen(true)}>{category.answer ? "Change answer" : "Record answer"}</button>}
    {open && <form onSubmit={submit} className="answer-form">
      {category.options.length > 0 && <div className="answer-options">{category.options.map(o => <button type="button" key={o} className={`status-badge ${answer === o ? "tone-no-change active" : "tone-all"}`} onClick={() => setAnswer(o)}>{o}</button>)}</div>}
      <input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Answer" />
      <input value={by} onChange={e => setBy(e.target.value)} placeholder="Answered by" />
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Note or reasoning (optional)" />
      <div><button type="submit" disabled={!answer.trim() || save.isPending}>Save</button><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button></div>
      {save.isError && <small className="error">{save.error.message}</small>}
    </form>}
  </div>;
}
