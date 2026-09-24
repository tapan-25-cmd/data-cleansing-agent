import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { AccuracyGroup, AccuracyKind, AccuracySet, ComparisonValues, getAccuracy, getAccuracySet, getRulesGuide, ReadingTestAnchor } from "../api/client";
import { JobTabs } from "./JobTabs";

const groupName: Record<string, string> = { A: "Group A", B: "Group B", C: "Group C" };
const groupWhat: Record<string, string> = { A: "Values were already filled in. We checked them.", B: "Values were missing. We filled them in from the older size field.", C: "Nothing usable existed. We read the descriptions." };
const kindTone: Record<AccuracyKind, string> = { CONFIRMED: "tone-no-change", CONSISTENT: "tone-consistent", FLAG: "tone-observation-only", ALARM: "tone-review-required", WRONG: "tone-unresolved", UNVERIFIED: "tone-skipped" };
const kindWord: Record<AccuracyKind, string> = { CONFIRMED: "Correct · own words", CONSISTENT: "Correct · another record", FLAG: "Sent to a person", ALARM: "Review not needed", WRONG: "Wrong", UNVERIFIED: "Not checkable" };
const sections: Array<[string, AccuracyKind[]]> = [["Counted as correct", ["CONFIRMED", "CONSISTENT"]], ["Sent to a person · beside the score", ["FLAG", "ALARM"]], ["Counted against us", ["WRONG"]], ["Shown, not scored", ["UNVERIFIED"]]];
const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());
const pct = (a: number, b: number) => (b ? `${(100 * a / b).toFixed(1)}%` : "—");
function values(v: ComparisonValues | null | undefined) {
  if (!v || (!v.standard_size && !v.standard_uom && !v.standard_pack_size)) return "blank";
  const unit = [v.standard_size, v.standard_uom].filter(Boolean).join(" ");
  return v.standard_pack_size ? `${unit} × ${v.standard_pack_size}` : unit;
}
const tone = (s: string) => `tone-${s.toLowerCase().replaceAll("_", "-")}`;

type Ladder = { label: string; num: number; den: number; reported?: boolean; link?: boolean };
function ladder(g: AccuracyGroup, anchor: ReadingTestAnchor): Ladder[] {
  const rows: Ladder[] = [{ label: "As reported", num: g.right, den: g.scored, reported: true }];
  if (g.flags) rows.push({ label: "If every product sent to a person counted as wrong", num: g.right, den: g.scored + g.flags });
  if (g.unverified) rows.push({ label: "If not-checkable products counted as wrong", num: g.right, den: g.scored + g.unverified });
  if (g.consistent) rows.push({ label: "If only the product's own words counted as proof", num: g.confirmed, den: g.confirmed + g.wrong });
  if (g.group === "C" && anchor?.score) {
    const s = anchor.score; const v = s.verdicts || {};
    rows.push({ label: `Known-answer test: ${n(s.tested)} products, sizes hidden from the reader`, num: s.agreed, den: s.tested, link: true });
    rows.push({ label: "Same test, products with unanswerable data removed", num: (v.CORRECT || 0) + (v.RULE_APPLIED || 0) + (v.CORRECT_CATCH || 0), den: s.tested - (v.DATA_PROBLEM || 0) });
  }
  return rows;
}

export function AccuracyPage() {
  const { jobId = "" } = useParams();
  const [active, setActive] = useState("A");
  const [open, setOpen] = useState<{ group: AccuracyGroup; set: AccuracySet } | null>(null);
  const [page, setPage] = useState(1);
  const [showMethod, setShowMethod] = useState(true);
  const [showLadder, setShowLadder] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const report = useQuery({ queryKey: ["accuracy", jobId], queryFn: () => getAccuracy(jobId), enabled: Boolean(jobId), retry: false, refetchInterval: q => (q.state.data?.status === "BUILDING" || (q.state.data?.status === "READY" && q.state.data.rebuilding) ? 4000 : false) });
  const rows = useQuery({ queryKey: ["accuracy-set", jobId, open?.set.id, page], queryFn: () => getAccuracySet(jobId, open!.set.id, page), enabled: Boolean(open) });
  const guide = useQuery({ queryKey: ["rules-guide", jobId], queryFn: () => getRulesGuide(jobId) });
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const r = report.data?.status === "READY" ? report.data : null;
  const all = r ? r.groups.reduce((a, g) => ({ products: a.products + g.products, scored: a.scored + g.scored, right: a.right + g.right, wrong: a.wrong + g.wrong, flags: a.flags + g.flags, unverified: a.unverified + g.unverified, confirmed: a.confirmed + g.confirmed, consistent: a.consistent + g.consistent }), { products: 0, scored: 0, right: 0, wrong: 0, flags: 0, unverified: 0, confirmed: 0, consistent: 0 }) : null;
  const g = r?.groups.find(x => x.group === active) || null;
  const fill = (text: string, gr: AccuracyGroup) => text.replace(/\{(\w+)\}/g, (_, k) => {
    const v: Record<string, unknown> = { ...gr, accuracy: gr.accuracy_percent ?? "—", coverage: gr.coverage_percent ?? "—" };
    const x = v[k]; return typeof x === "number" ? x.toLocaleString() : String(x ?? "—");
  });

  return <div className="results-page acc-page">
    <header className="results-header">
      <div><p className="eyebrow">Accuracy</p><h1>How accurate the cleansing is</h1><p>Every product is counted. A result is correct only when something other than itself agrees with it.</p></div>
      <Link className="secondary" to="/">← Back to conversation</Link>
    </header>
    <JobTabs jobId={jobId} active="accuracy" />
    {report.isError && <div className="alert error">{report.error.message}</div>}
    {report.data?.status === "FAILED" && <div className="alert error failed-job"><span>The check did not finish: {report.data.error}</span><button className="secondary" onClick={() => fetch(`/api/jobs/${jobId}/accuracy?rebuild=true`).then(() => report.refetch())}>Retry</button></div>}
    {report.data?.status === "BUILDING" && <section className="compare-loading"><span className="spinner" /><div><strong>Checking every product</strong><p>Runs once per workbook version and takes under a minute. The page refreshes by itself.</p></div></section>}

    {r && all && g && <>
      {/* 1. The number and the sum that makes it */}
      <section className="ledger-shell acc-card">
        <div className="ledger-meta"><strong>Across all groups</strong><span>{n(all.products)} products · built {new Date(r.built_at).toLocaleDateString()}{r.rebuilding ? " · refreshing" : ""}</span></div>
        <div className="acc-hero2">
          <div className="acc-big"><strong>{pct(all.right, all.scored)}</strong><span>{n(all.right)} correct of {n(all.scored)} checked</span></div>
          <div className="acc-sum">
            <Step label="All products" value={n(all.products)} sub="every live row in the workbook" />
            <i>−</i><Step label="Not checkable" value={n(all.unverified)} muted sub="nothing exists to compare them with" />
            <i>−</i><Step label="Sent to a person" value={n(all.flags)} muted sub="a person decides; not scored either way" />
            <i>=</i><Step label="Checked" value={n(all.scored)} sub="have something to compare with" />
            <i>→</i><Step label="Correct" value={n(all.right)} good sub={`${n(all.wrong)} of the checked are wrong`} />
          </div>
          <p className="acc-reading">In words: of {n(all.products)} products, {n(all.unverified)} have nothing to check them against and {n(all.flags)} were handed to a person, so {n(all.scored)} could be checked. Of those, {n(all.right)} are right and {n(all.wrong)} are wrong. {n(all.right)} ÷ {n(all.scored)} = <b>{pct(all.right, all.scored)}</b>.</p>
          <div className="acc-rest">
            <span className="status-badge tone-no-change">Confirmed by the product's own words <b>{n(all.confirmed)}</b></span>
            <span className="status-badge tone-consistent tint">Consistent with another record <b>{n(all.consistent)}</b></span>
            <small>Another record rules out a typo, not a shared mistake. Only the product's own words are independent proof.</small>
          </div>
        </div>
      </section>

      {/* 2. Group selector */}
      <div className="acc-groups">
        {r.groups.map(x => <button key={x.group} className={`acc-group-tab ${active === x.group ? "active" : ""}`} onClick={() => { setActive(x.group); setShowLadder(false); }}>
          <small>{groupName[x.group]}</small><strong>{x.accuracy_percent == null ? "—" : `${x.accuracy_percent}%`}</strong><span>{n(x.right)} of {n(x.scored)} checked · {n(x.products)} products</span>
        </button>)}
      </div>

      {/* 3. The selected group, one fixed structure */}
      <section className="ledger-shell acc-card">
        <div className="ledger-meta"><strong>{groupName[g.group]} · {groupWhat[g.group]}</strong><span>coverage {g.coverage_percent ?? "—"}% of {n(g.products)} products</span></div>
        <div className="acc-sum in-card">
          <Step label="Products" value={n(g.products)} sub="in this group" />
          <i>−</i><Step label="Not checkable" value={n(g.unverified)} muted sub="no witness exists" />
          <i>−</i><Step label="Sent to a person" value={n(g.flags)} muted sub={g.alarms ? `${n(g.alarms)} of them were not needed` : "a person decides"} />
          <i>=</i><Step label="Checked" value={n(g.scored)} sub="can be scored" />
          <i>→</i><Step label="Correct" value={n(g.right)} good sub={`${n(g.wrong)} wrong`} />
          <i>=</i><Step label="Accuracy" value={g.accuracy_percent == null ? "—" : `${g.accuracy_percent}%`} good sub="correct ÷ checked" />
        </div>
        <p className="acc-reading">In words: {groupName[g.group]} has {n(g.products)} products. {n(g.unverified)} cannot be checked and {n(g.flags)} went to a person, so {n(g.scored)} were checked. {n(g.right)} of those are right, {n(g.wrong)} wrong. {n(g.right)} ÷ {n(g.scored)} = <b>{g.accuracy_percent == null ? "—" : `${g.accuracy_percent}%`}</b>.{g.coverage_percent != null && g.coverage_percent < 50 ? ` Only ${g.coverage_percent}% of the group could be checked, so read this number with that in mind.` : ""}</p>
        <div className="acc-meter wide" title="green correct · purple wrong · teal sent to a person · grey not checkable">
          <span className="m-right" style={{ width: `${100 * g.right / Math.max(1, g.products)}%` }} /><span className="m-wrong" style={{ width: `${100 * g.wrong / Math.max(1, g.products)}%` }} /><span className="m-flag" style={{ width: `${100 * g.flags / Math.max(1, g.products)}%` }} /><span className="m-none" style={{ width: `${100 * g.unverified / Math.max(1, g.products)}%` }} />
        </div>
        {(g.group === "C" && r.reading_test?.score) || (g.group === "A" && r.disputed_a_rows) ? <div className="acc-inline-notes">
          {g.group === "A" && r.disputed_a_rows > 0 && <span className="status-badge tone-all">includes {r.disputed_a_rows} disputed A rows, all sent to a person</span>}
          {g.group === "C" && r.reading_test?.score && <Link className="status-badge tone-all" to={`/jobs/${jobId}/performance`}>Reader tested on known answers: {n(r.reading_test.score.agreed)} of {n(r.reading_test.score.tested)} →</Link>}
        </div> : null}
      </section>

      <section className="ledger-shell acc-card">
        <button className="ledger-meta as-button" onClick={() => setShowMethod(v => !v)}><strong>How we got this number</strong><span>{showMethod ? "hide" : "show"}</span></button>
        {showMethod && <ol className="rule-steps method-steps in-card">{(guide.data?.accuracy_method?.[g.group] || []).map((step, i) => <li key={i}><span>{fill(step, g)}</span></li>)}</ol>}
      </section>

      <section className="ledger-shell acc-card">
        <div className="ledger-meta"><strong>Where every product landed</strong><span>click a row to see its products</span></div>
        <div className="ledger-table-wrap"><table className="ledger-table acc-table"><thead><tr><th>Outcome</th><th>Products</th><th></th><th>Counted as</th></tr></thead><tbody>
          {sections.map(([title, kinds]) => {
            const list = g.sets.filter(s => kinds.includes(s.kind) && s.products > 0).sort((a, b) => b.products - a.products);
            const total = list.reduce((t, s) => t + s.products, 0);
            if (!list.length && !kinds.includes("WRONG")) return null;
            return [
              <tr key={title} className="acc-section-row"><td colSpan={4}><span className={`dot ${kindTone[kinds[0]]}`} />{title} · {n(total)}</td></tr>,
              ...list.map(s => <tr key={s.id} onClick={() => { setOpen({ group: g, set: s }); setPage(1); }} title={s.reason}>
                <td><strong>{s.name}</strong></td>
                <td className="num">{n(s.products)}</td>
                <td className="barcell"><span className={`bar kind-${s.kind.toLowerCase()}`}><i style={{ width: `${Math.max(0.6, 100 * s.products / Math.max(1, g.products))}%` }} /></span></td>
                <td><span className={`status-badge ${kindTone[s.kind]} ${s.kind === "CONSISTENT" ? "tint" : ""}`}>{kindWord[s.kind]}</span></td>
              </tr>),
              ...(!list.length ? [<tr key={`${title}-none`} className="inert"><td colSpan={4} className="muted">Nothing counted against us in this group</td></tr>] : []),
            ];
          })}
        </tbody></table></div>
      </section>

      <section className="ledger-shell acc-card">
        <button className="ledger-meta as-button" onClick={() => setShowLadder(v => !v)}><strong>Other ways to count it</strong><span>{showLadder ? "hide" : "show"}</span></button>
        {showLadder && <div className="acc-ladder in-card">{ladder(g, r.reading_test).map((l, i) => <div key={i} className={`acc-ladder-row ${l.reported ? "reported" : ""}`}><span>{l.label}</span><span className="frac">{n(l.num)} ÷ {n(l.den)}</span><b>{pct(l.num, l.den)}</b><span className="ratio"><i style={{ width: `${l.den ? 100 * l.num / l.den : 0}%` }} /></span>{l.link && <Link className="status-badge tone-all" to={`/jobs/${jobId}/performance`}>Agent performance →</Link>}</div>)}</div>}
      </section>
    </>}

    {open && <aside className="result-detail" aria-modal="true" role="dialog">
      <button className="detail-close" ref={closeRef} onClick={() => setOpen(null)}>×</button>
      <div className="detail-content">
        <p className="eyebrow">{groupName[open.group.group]} · {kindWord[open.set.kind]}</p><h2>{open.set.name}</h2>
        <div className="detail-badges"><span className={`status-badge ${kindTone[open.set.kind]} ${open.set.kind === "CONSISTENT" ? "tint" : ""}`}>{kindWord[open.set.kind]}</span><span className="result-badge">{n(open.set.products)} products</span></div>
        {(open.set.kind === "ALARM" || open.set.kind === "WRONG") ? <section className="review-explanation"><p className="eyebrow">Why this counts against us</p><h3>{open.set.reason}</h3></section> : <p className="status-explanation">{open.set.reason}</p>}
        <section className="detail-section">
          <div className="detail-section-heading"><h3>Products</h3><span>{rows.data ? `page ${rows.data.page} of ${Math.max(1, Math.ceil(rows.data.total / rows.data.page_size))}` : "…"}</span></div>
          <div className="detail-findings">{(rows.data?.rows || []).map(x => <article key={x.row_number}>
            <div className="detail-badges"><strong>{x.item_no}</strong><span className={`status-badge ${tone(x.status)}`}>{x.status_label}</span></div>
            <p>{x.product}{x.product_local ? ` · ${x.product_local}` : ""}</p>
            <small className="witness-line"><strong>Witness</strong> {x.witness || "—"}</small>
            <small>Excel {values(x.values)}{x.legacy ? ` · legacy ${x.legacy}` : ""}{x.suggestion ? ` · suggested ${values(x.suggestion)}` : ""}</small>
          </article>)}</div>
          {rows.data && rows.data.total > rows.data.page_size && <div className="ledger-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><button className="secondary" disabled={page * rows.data.page_size >= rows.data.total} onClick={() => setPage(p => p + 1)}>Next</button></div>}
        </section>
      </div>
    </aside>}
  </div>;
}

function Step({ label, value, sub, muted, good }: { label: string; value: string; sub?: string; muted?: boolean; good?: boolean }) {
  return <div className={`acc-step ${muted ? "muted" : ""} ${good ? "good" : ""}`}><small>{label}</small><strong>{value}</strong>{sub && <em>{sub}</em>}</div>;
}
