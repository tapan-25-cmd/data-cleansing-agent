import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getJob, getReasoningSummary, getResultFacets, getRulesGuide, getSummary, RulesGuide } from "../api/client";
import { JobTabs } from "./JobTabs";

type Node = RulesGuide["pipeline"]["nodes"][number];

// Where each step sits on the board: [column, row]. Columns 1-3 are the three lanes.
const positions: Record<string, [number, number]> = {
  upload: [2, 1], select: [2, 2], read: [2, 3], purge: [2, 4], lane: [2, 5],
  lane_a: [1, 6], a_legacy: [1, 7], a_text: [1, 8],
  lane_b: [2, 6], b_convert: [2, 7], b_guards: [2, 8],
  lane_c: [3, 6], c_ai: [3, 7], c_guards: [3, 8],
  ledger: [2, 9], reason: [2, 10], review: [1, 11], export: [2, 12], measure: [3, 11],
};
const ROWS = 12;

function toneFor(status: string) { return `tone-${status.toLowerCase().replaceAll("_", "-")}`; }

export function PipelinePage() {
  const { jobId = "" } = useParams();
  const guide = useQuery({ queryKey: ["rules-guide", jobId], queryFn: () => getRulesGuide(jobId || undefined) });
  const summary = useQuery({ queryKey: ["summary", jobId], queryFn: () => getSummary(jobId), enabled: Boolean(jobId) });
  const facets = useQuery({ queryKey: ["result-facets", jobId], queryFn: () => getResultFacets(jobId), enabled: Boolean(jobId) });
  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => getJob(jobId), enabled: Boolean(jobId) });
  const reasoning = useQuery({ queryKey: ["reasoning", jobId], queryFn: () => getReasoningSummary(jobId), enabled: Boolean(jobId) });
  const [selected, setSelected] = useState<Node | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Array<{ d: string; label?: string; x: number; y: number }>>([]);
  const pipeline = guide.data?.pipeline;

  const counts: Record<string, number | undefined> = {
    ...(summary.data?.stats as Record<string, number | undefined> | undefined),
    ai_calls: (job.data as { ai_usage?: { calls?: number } } | undefined)?.ai_usage?.calls,
    ...Object.fromEntries(Object.entries(facets.data?.facets.status || {}).map(([k, v]) => [`status:${k}`, v])),
    reasoning_rows: reasoning.data?.status === "READY" ? reasoning.data.summary.rows : undefined,
  };

  useLayoutEffect(() => {
    if (!pipeline || !board.current) return;
    const draw = () => {
      const root = board.current!;
      const origin = root.getBoundingClientRect();
      const box = (id: string) => {
        const el = root.querySelector<HTMLElement>(`[data-node="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left - origin.left + root.scrollLeft, top: r.top - origin.top + root.scrollTop, width: r.width, height: r.height };
      };
      const next = pipeline.edges.flatMap(([from, to, label]) => {
        const a = box(from), b = box(to);
        if (!a || !b) return [];
        const sameRow = Math.abs(a.top - b.top) < 4;
        let d: string, x: number, y: number;
        if (sameRow) {
          const leftToRight = a.left < b.left;
          const x1 = leftToRight ? a.left + a.width : a.left, x2 = leftToRight ? b.left : b.left + b.width;
          const yy = a.top + a.height / 2;
          d = `M ${x1} ${yy} L ${x2} ${yy}`; x = (x1 + x2) / 2; y = yy - 8;
        } else {
          const x1 = a.left + a.width / 2, y1 = a.top + a.height;
          const x2 = b.left + b.width / 2, y2 = b.top;
          const my = y1 + Math.max(14, (y2 - y1) / 2);
          d = b.top < a.top
            ? `M ${a.left + a.width} ${a.top + a.height / 2} L ${b.left + b.width / 2} ${a.top + a.height / 2} L ${b.left + b.width / 2} ${b.top + b.height}`
            : `M ${x1} ${y1} L ${x1} ${my} L ${x2} ${my} L ${x2} ${y2}`;
          x = (x1 + x2) / 2; y = my - 6;
        }
        return [{ d, label, x, y }];
      });
      setLines(next);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(board.current);
    window.addEventListener("resize", draw);
    return () => { observer.disconnect(); window.removeEventListener("resize", draw); };
  }, [pipeline, summary.data, facets.data, reasoning.data]);

  useEffect(() => { setSelected(null); }, [jobId]);

  return <div className="results-page">
    <header className="results-header">
      <div>
        <p className="eyebrow">Pipeline</p>
        <h1>From upload to download</h1>
        <p>Every step the tool takes with a workbook, in order, with the number of rows that reached it on this run. Click a step to read what goes in, what comes out and which rules it uses.</p>
      </div>
      <Link className="secondary" to="/">← Back to conversation</Link>
    </header>
    {jobId && <JobTabs jobId={jobId} active="pipeline" />}
    {guide.isError && <div className="alert error">{guide.error.message}</div>}

    {pipeline && <>
      <div className="outcome-overview pipeline-legend">
        <small>Steps</small>
        <span className="pipe-legend start">Start and end</span>
        <span className="pipe-legend process">Processing step</span>
        <span className="pipe-legend decision">Decision</span>
        <span className="pipe-legend lane">Lane</span>
        <span className="pipe-legend side">Alongside</span>
      </div>
      <section className="pipeline-shell">
        <div className="lane-heads"><span>Lane A · values complete</span><span>Lane B · legacy only</span><span>Lane C · nothing usable</span></div>
        <div className="pipeline-board" ref={board} style={{ gridTemplateRows: `repeat(${ROWS}, auto)` }}>
          <svg className="pipeline-lines" aria-hidden="true">
            <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8fa5a0" /></marker></defs>
            {lines.map((l, i) => <g key={i}><path d={l.d} fill="none" stroke="#9fb3ae" strokeWidth="1.6" markerEnd="url(#arrow)" />{l.label && <text x={l.x} y={l.y} textAnchor="middle">{l.label}</text>}</g>)}
          </svg>
          {pipeline.nodes.map(node => {
            const [col, row] = positions[node.id] || [2, ROWS];
            const count = node.count ? counts[node.count] : undefined;
            return <button key={node.id} data-node={node.id} className={`pipe-node kind-${node.kind} ${selected?.id === node.id ? "selected" : ""}`} style={{ gridColumn: col, gridRow: row }} onClick={() => setSelected(node)}>
              <strong>{node.title}</strong>
              <span>{node.summary}</span>
              {count !== undefined && <b>{count.toLocaleString()} <small>{node.count_label}</small></b>}
              {node.id === "ledger" && facets.data && <div className="pipe-labels">{pipeline.labels.map(l => <em key={l.status} className={`status-badge ${toneFor(l.status)}`}>{l.label} <b>{(facets.data!.facets.status[l.status] || 0).toLocaleString()}</b></em>)}</div>}
            </button>;
          })}
        </div>
      </section>
    </>}

    {selected && <aside className="result-detail">
      <button className="detail-close" onClick={() => setSelected(null)}>×</button>
      <div className="detail-content">
        <p className="eyebrow">Step</p><h2>{selected.title}</h2>
        <div className="detail-badges"><span className={`pipe-legend ${selected.kind}`}>{selected.kind === "start" || selected.kind === "end" ? "Start and end" : selected.kind === "side" ? "Alongside" : selected.kind[0].toUpperCase() + selected.kind.slice(1)}</span>{selected.count && counts[selected.count] !== undefined && <span className="result-badge">{counts[selected.count]!.toLocaleString()} {selected.count_label}</span>}</div>
        <section className="review-explanation"><p className="eyebrow">What happens here</p><h3>{selected.summary}</h3><p>{selected.detail}</p></section>
        {selected.steps && <section className="detail-section"><div className="detail-section-heading"><h3>Tried in this order</h3><span>the first that fits decides</span></div><ol className="rule-steps">{selected.steps.map((step, i) => <RuleStep key={i} text={step} />)}</ol></section>}
        <section className="klm-glance">
          <div className="klm-heading"><h3>In and out</h3></div>
          <div className="klm-table io-table">
            <div className="klm-table-head"><span>Goes in</span><span>Comes out</span></div>
            <div><span>{selected.inputs.join(" · ")}</span><span>{selected.outputs.join(" · ")}</span></div>
          </div>
        </section>
        {selected.rules_tab && <section className="detail-section"><div className="detail-section-heading"><h3>Rules used</h3></div><p className="source-help">The tables and rules for this step are on the Rules tab.</p><Link className="secondary" to={jobId ? `/jobs/${jobId}/rules?section=${selected.rules_tab}` : `/rules?section=${selected.rules_tab}`}>Open the rules for this step →</Link></section>}
      </div>
    </aside>}
  </div>;
}

function RuleStep({ text }: { text: string }) {
  const [condition, result] = text.split("→");
  const label = (result || "").trim();
  const tone = label.startsWith("Needs") ? "tone-review-required" : label.startsWith("Already") ? "tone-no-change" : "tone-observation-only";
  const [head, ...rest] = label.split(";");
  return <li><span>{condition.trim()}</span><em><b className={`status-badge ${tone}`}>{head.replace(/\s*\(.*\)$/, "").trim()}</b>{(rest.join(";") || (head.match(/\((.*)\)/)?.[1] ?? "")).trim()}</em></li>;
}
