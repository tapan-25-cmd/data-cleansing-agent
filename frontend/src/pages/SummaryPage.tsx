import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getSummary } from "../api/client";

export function SummaryPage() {
  const { jobId = "" } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ["summary", jobId], queryFn: () => getSummary(jobId) });
  if (isLoading) return <section className="page"><p>Loading summary…</p></section>;
  if (error || !data) return <section className="page"><div className="alert error">Unable to load this run.</div></section>;
  const stats = data.stats;
  const cards = [
    ["Department rows", stats.department_rows], ["Purged", stats.purged], ["Live", stats.live],
    ["Validated", stats.group_a], ["Rule fixes", stats.group_b], ["Needs interpretation", stats.group_c],
  ];
  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Processing complete</p><h1>Review the proposals.</h1></div><span className="status">{data.pending_review} pending</span></div>
    <div className="metric-grid">{cards.map(([label, value]) => <article className="metric" key={String(label)}><span>{label}</span><strong>{Number(value ?? 0).toLocaleString()}</strong></article>)}</div>
    <div className="two-column">
      <article className="panel">
        <p className="eyebrow">Deterministic coverage</p>
        <h2>Ruleset {data.rule_readiness.ruleset_version ?? "—"}</h2>
        <p className="hash">{data.rule_readiness.ruleset_checksum?.slice(0, 20) ?? "—"}…</p>
        <p><strong>{data.rule_readiness.covered_source_uoms?.length ?? 0}</strong> covered source units · <strong>{data.rule_readiness.uncovered_source_uoms?.length ?? 0}</strong> uncovered</p>
        {(data.rule_readiness.uncovered_source_uoms?.length ?? 0) > 0 && <div className="chips">{data.rule_readiness.uncovered_source_uoms?.map(unit => <span key={unit}>{unit}</span>)}</div>}
        <Link className="button-link" to={`/jobs/${jobId}/review/b`}>Review rule proposals →</Link>
      </article>
      <article className="panel dark">
        <p className="eyebrow">Description inference</p>
        <h2>{stats.group_c ?? 0} items need judgment</h2>
        <p>The agent declines when the supplied text has no explicit evidence. No product size is guessed.</p>
        <Link className="button-link light" to={`/jobs/${jobId}/review/c`}>Review individual items →</Link>
      </article>
    </div>
    <div className="footer-action"><Link className="secondary" to={`/jobs/${jobId}/export`}>Export readiness</Link></div>
  </section>;
}
