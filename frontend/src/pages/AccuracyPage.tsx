import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { AccuracyGroup, getAccuracy, getRulesGuide, groupTitle } from "../api/client";
import { JobTabs } from "./JobTabs";
import { AccuracyGroupView, specFor } from "./AccuracyGroupView";

const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());
const pct = (a: number, b: number) => (b ? `${(100 * a / b).toFixed(1)}%` : "—");

export function AccuracyPage() {
  const { jobId = "" } = useParams();
  const [active, setActive] = useState("B");
  const [showMethod, setShowMethod] = useState(true);
  const report = useQuery({ queryKey: ["accuracy", jobId], queryFn: () => getAccuracy(jobId), enabled: Boolean(jobId), retry: false, refetchInterval: q => (q.state.data?.status === "BUILDING" || (q.state.data?.status === "READY" && q.state.data.rebuilding) ? 4000 : false) });
  const guide = useQuery({ queryKey: ["rules-guide", jobId], queryFn: () => getRulesGuide(jobId) });
  const r = report.data?.status === "READY" ? report.data : null;
  const all = r ? r.groups.reduce((a, g) => ({ products: a.products + g.products, scored: a.scored + g.scored, right: a.right + g.right, against: a.against + g.wrong + g.alarms, unverified: a.unverified + g.unverified }), { products: 0, scored: 0, right: 0, against: 0, unverified: 0 }) : null;
  const by = Object.fromEntries((r?.groups || []).map(x => [x.group, x])) as Record<string, AccuracyGroup | undefined>;
  const g = by[active] || null;
  const fill = (text: string, gr: AccuracyGroup) => text.replace(/\{(\w+)\}/g, (_, k) => {
    const v: Record<string, unknown> = { ...gr, accuracy: gr.accuracy_percent ?? "—", coverage: gr.coverage_percent ?? "—" };
    const x = v[k]; return typeof x === "number" ? x.toLocaleString() : String(x ?? "—");
  });

  return <div className="results-page acc-page">
    <header className="results-header">
      <div><p className="eyebrow">Accuracy</p><h1>How accurate the cleansing is</h1><p>Every product is counted, in the group of its result, and judged against that group's own question.</p></div>
      <Link className="secondary" to="/">← Back to conversation</Link>
    </header>
    <JobTabs jobId={jobId} active="accuracy" />
    <div className="acc-subnav"><button className="active">Accuracy</button><Link to={`/jobs/${jobId}/blind-test`}>Blind test</Link></div>
    {report.isError && <div className="alert error">{report.error.message}</div>}
    {report.data?.status === "FAILED" && <div className="alert error failed-job"><span>The check did not finish: {report.data.error}</span><button className="secondary" onClick={() => fetch(`/api/jobs/${jobId}/accuracy?rebuild=true`).then(() => report.refetch())}>Retry</button></div>}
    {report.data?.status === "BUILDING" && <section className="compare-loading"><span className="spinner" /><div><strong>Checking every product</strong><p>Runs once per workbook version and takes under a minute. The page refreshes by itself.</p></div></section>}

    {r && all && g && <>
      {/* 1. The number and the sum that makes it */}
      <section className="ledger-shell acc-card">
        <div className="ledger-meta"><strong>Across all groups</strong><span>{n(all.products)} products · built {new Date(r.built_at).toLocaleDateString()}{r.rebuilding ? " · refreshing" : ""}</span></div>
        <div className="acc-hero2">
          <div className="acc-big"><strong>{pct(all.right, all.scored)}</strong><span>{n(all.right)} right of {n(all.scored)} checked</span></div>
          <div className="acc-sum">
            <Step label="All products" value={n(all.products)} sub="every live row in the workbook" />
            <i>−</i><Step label="Not checkable" value={n(all.unverified)} muted sub="kept or changed with nothing in the file to compare them with" />
            <i>=</i><Step label="Checked" value={n(all.scored)} sub="have something to compare with" />
            <i>→</i><Step label="Right" value={n(all.right)} good sub={`${n(all.against)} of the checked count against the tool`} />
          </div>
          <p className="acc-reading">In words: of {n(all.products)} products, {n(all.unverified)} have nothing to check them against, so {n(all.scored)} could be checked. Of those, {n(all.right)} are right: kept rightly (A), changed rightly (B) or raised for a reason the data bears out (C). {n(all.against)} count against the tool. {n(all.right)} ÷ {n(all.scored)} = <b>{pct(all.right, all.scored)}</b>.</p>
        </div>
      </section>

      {/* 2. Group selector */}
      <div className="acc-groups">
        {(["A", "B", "C"] as const).map(key => by[key]).filter((x): x is AccuracyGroup => Boolean(x)).map(x => <button key={x.group} className={`acc-group-tab ${active === x.group ? "active" : ""}`} onClick={() => setActive(x.group)}>
          <small>{groupTitle(x.group)}</small><strong>{x.accuracy_percent == null ? "—" : `${x.accuracy_percent}%`}</strong><span>{x.question} {n(x.right)} of {n(x.scored)} · {n(x.products)} products</span>
        </button>)}
      </div>

      {/* 3. The selected group */}
      <AccuracyGroupView jobId={jobId} g={g} spec={specFor(g)} />

      <section className="ledger-shell acc-card">
        <button className="ledger-meta as-button" onClick={() => setShowMethod(v => !v)}><strong>How we got this number</strong><span>{showMethod ? "hide" : "show"}</span></button>
        {showMethod && <ol className="rule-steps method-steps in-card">{(guide.data?.accuracy_method?.[g.group] || []).map((step, i) => <li key={i}><span>{fill(step, g)}</span></li>)}</ol>}
      </section>
    </>}
  </div>;
}

function Step({ label, value, sub, muted, good }: { label: string; value: string; sub?: string; muted?: boolean; good?: boolean }) {
  return <div className={`acc-step ${muted ? "muted" : ""} ${good ? "good" : ""}`}><small>{label}</small><strong>{value}</strong>{sub && <em>{sub}</em>}</div>;
}
