import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AccuracyGroup, ClientMeasuresReport, getAccuracy, getRulesGuide, groupTitle } from "../api/client";
import { JobTabs } from "./JobTabs";
import { AccuracyGroupView, specFor } from "./AccuracyGroupView";
import { ConsistencyCard, FlagPrecisionCard, MeasuresOverview, RuleAccuracyCard } from "./ClientMeasures";

const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());

// Group A is not given a percentage: agreeing with the legacy size is consistency, not
// proof (the client's point). B and C show the client's rule accuracy and flag precision.
function headline(g: AccuracyGroup, m?: ClientMeasuresReport) {
  if (!m) return g.accuracy_percent == null ? "—" : `${g.accuracy_percent}%`;
  if (g.group === "A") return n(m.consistency.exact + m.consistency.within_one + m.consistency.fluid);
  const v = g.group === "B" ? m.rule_accuracy.percent : m.flag_precision.percent;
  return v == null ? "—" : `${v}%`;
}
function subline(g: AccuracyGroup, m?: ClientMeasuresReport) {
  if (!m) return `${n(g.right)} of ${n(g.scored)} checked`;
  if (g.group === "A") return `match the legacy size · ${n(m.consistency.confirmed_by_text)} confirmed by the description`;
  if (g.group === "B") return `rule accuracy · ${n(m.rule_accuracy.matched)} of ${n(m.rule_accuracy.tested)}`;
  return `flag precision · ${n(m.flag_precision.justified)} of ${n(m.flag_precision.products)}`;
}

export function AccuracyPage() {
  const { jobId = "" } = useParams();
  // ?group=A opens a group directly.
  const [params, setParams] = useSearchParams();
  const active = ["A", "B", "C"].includes(params.get("group") || "") ? params.get("group")! : "B";
  const setActive = (group: string) => setParams({ group }, { replace: true });
  const [showMethod, setShowMethod] = useState(true);
  const report = useQuery({ queryKey: ["accuracy", jobId], queryFn: () => getAccuracy(jobId), enabled: Boolean(jobId), retry: false, refetchInterval: q => (q.state.data?.status === "BUILDING" || (q.state.data?.status === "READY" && q.state.data.rebuilding) ? 4000 : false) });
  const guide = useQuery({ queryKey: ["rules-guide", jobId], queryFn: () => getRulesGuide(jobId) });
  const r = report.data?.status === "READY" ? report.data : null;
  const by = Object.fromEntries((r?.groups || []).map(x => [x.group, x])) as Record<string, AccuracyGroup | undefined>;
  const g = by[active] || null;
  const fill = (text: string, gr: AccuracyGroup) => text.replace(/\{(\w+)\}/g, (_, k) => {
    const v: Record<string, unknown> = { ...gr, accuracy: gr.accuracy_percent ?? "—", coverage: gr.coverage_percent ?? "—" };
    const x = v[k]; return typeof x === "number" ? x.toLocaleString() : String(x ?? "—");
  });

  return <div className="results-page acc-page">
    <header className="results-header">
      <div><p className="eyebrow">Accuracy</p><h1>How accurate the cleansing is</h1><p>The client's three Release 1 measures, in their words, computed on this run. Our own checks follow under each group.</p></div>
      <Link className="secondary" to="/">← Back to conversation</Link>
    </header>
    <JobTabs jobId={jobId} active="accuracy" />
    <div className="acc-subnav"><button className="active">Accuracy</button><Link to={`/jobs/${jobId}/blind-test`}>Blind test</Link></div>
    {report.isError && <div className="alert error">{report.error.message}</div>}
    {report.data?.status === "FAILED" && <div className="alert error failed-job"><span>The check did not finish: {report.data.error}</span><button className="secondary" onClick={() => fetch(`/api/jobs/${jobId}/accuracy?rebuild=true`).then(() => report.refetch())}>Retry</button></div>}
    {report.data?.status === "BUILDING" && <section className="compare-loading"><span className="spinner" /><div><strong>Checking every product</strong><p>Runs once per workbook version and takes under a minute. The page refreshes by itself.</p></div></section>}

    {r && g && <>
      {/* 1. The three measures, as the client set them out */}
      {r.measures ? <MeasuresOverview m={r.measures} onOpen={setActive} /> : <div className="alert">This report was built before the client's measures were added; it refreshes by itself.</div>}

      {/* 2. Group selector */}
      <div className="acc-groups">
        {(["A", "B", "C"] as const).map(key => by[key]).filter((x): x is AccuracyGroup => Boolean(x)).map(x => <button key={x.group} className={`acc-group-tab ${active === x.group ? "active" : ""}`} onClick={() => setActive(x.group)}>
          <small>{groupTitle(x.group)}</small><strong>{headline(x, r.measures)}</strong><span>{subline(x, r.measures)} · {n(x.products)} products</span>
        </button>)}
      </div>

      {/* 3. The selected group: the client's measure first, then our checks */}
      {r.measures && g.group === "A" && <ConsistencyCard jobId={jobId} m={r.measures} />}
      {r.measures && g.group === "B" && <RuleAccuracyCard jobId={jobId} m={r.measures} />}
      {r.measures && g.group === "C" && <FlagPrecisionCard jobId={jobId} m={r.measures} />}
      <p className="cm-divider">Our checks in detail</p>
      <AccuracyGroupView jobId={jobId} g={g} spec={specFor(g)} />

      <section className="ledger-shell acc-card">
        <button className="ledger-meta as-button" onClick={() => setShowMethod(v => !v)}><strong>How we got this number</strong><span>{showMethod ? "hide" : "show"}</span></button>
        {showMethod && <ol className="rule-steps method-steps in-card">{(guide.data?.accuracy_method?.[g.group] || []).map((step, i) => <li key={i}><span>{fill(step, g)}</span></li>)}</ol>}
      </section>
    </>}
  </div>;
}

