import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getSampleCheck, getSampleCheckRows, groupTitle, OutcomeGroup, runSampleCheck, SampleCheckGroup, SampleCheckRow, verifyItem } from "../api/client";
import { JobTabs } from "./JobTabs";

const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());
const groups: OutcomeGroup[] = ["A", "B", "C"];
const verdictTone: Record<string, string> = { RIGHT: "tone-no-change", WRONG: "tone-unresolved", CANT_TELL: "tone-skipped" };

function Figure({ g }: { g: SampleCheckGroup }) {
  if (g.too_few) return <><b className="sc-big muted">{n(g.judged)}</b><span>judged, too few for a figure</span></>;
  return <><b className="sc-big">{g.percent}%</b><span>±{g.margin} pts · {n(g.right)} of {n(g.judged)} right{g.cant_tell ? ` · ${n(g.cant_tell)} can't tell` : ""}</span></>;
}

export function SampleCheckPage() {
  const { jobId = "" } = useParams();
  const qc = useQueryClient();
  const [size, setSize] = useState(30);
  const [open, setOpen] = useState<OutcomeGroup | null>(null);
  const [selected, setSelected] = useState<SampleCheckRow | null>(null);
  const check = useQuery({ queryKey: ["sample-check", jobId], queryFn: () => getSampleCheck(jobId), enabled: Boolean(jobId), refetchInterval: q => (q.state.data?.status === "RUNNING" ? 3000 : false) });
  const rows = useQuery({ queryKey: ["sample-check-rows", jobId, open], queryFn: () => getSampleCheckRows(jobId, open!), enabled: Boolean(open) && check.data?.status === "READY" });
  const run = useMutation({ mutationFn: () => runSampleCheck(jobId, size), onSuccess: () => check.refetch() });
  const mark = useMutation({ mutationFn: ({ row, verdict }: { row: number; verdict: "CORRECT" | "WRONG" | null }) => verifyItem(jobId, row, verdict),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sample-check-rows", jobId] }); qc.invalidateQueries({ queryKey: ["sample-check", jobId] }); } });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const d = check.data;
  const ready = d?.status === "READY";
  const running = d?.status === "RUNNING";
  const meta = Object.fromEntries((d?.groups_meta || []).map(m => [m.group, m]));
  const byGroup = Object.fromEntries((ready ? d.groups : []).map(g => [g.group, g])) as Record<string, SampleCheckGroup | undefined>;
  const calls = groups.reduce((t, g) => t + Math.min(size, meta[g]?.population || 0), 0);

  return <div className="results-page acc-page">
    <header className="results-header">
      <div><p className="eyebrow">Accuracy · Sample check</p><h1>A second model judges a sample</h1><p>A fixed random sample per group, judged on the group's one question. One figure per group, with its margin.</p></div>
      <Link className="secondary" to="/">← Back to conversation</Link>
    </header>
    <JobTabs jobId={jobId} active="accuracy" />
    <div className="acc-subnav"><Link to={`/jobs/${jobId}/accuracy`}>Accuracy</Link><Link to={`/jobs/${jobId}/blind-test`}>Blind test</Link><button className="active">Sample check</button></div>
    {check.isError && <div className="alert error">{check.error.message}</div>}
    {d?.status === "FAILED" && <div className="alert error">The check did not finish: {d.error}</div>}

    {d && <section className="ledger-shell acc-card sc-run">
      <div className="sc-run-left">
        <strong>{ready ? `Judged ${new Date(d.judged_at!).toLocaleString()}` : running ? "Judging…" : "Not run yet"}</strong>
        <span>{ready ? `${n(d.calls)} rows · ${d.model_id}` : running ? `${n(d.done)} of ${n(d.total)} rows` : d.provider_is_real ? `One model call per row · judge ${d.judge_model || "not set"}` : "The AI is switched off on this server (AI_PROVIDER=mock)"}</span>
        {running && <div className="progress-rail"><span style={{ width: `${d.total ? (100 * (d.done || 0)) / d.total : 5}%` }} /></div>}
      </div>
      <div className="sc-run-right">
        <label>Rows per group <select value={size} onChange={e => setSize(Number(e.target.value))} disabled={running}>{[30, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <button className="primary" disabled={running || run.isPending || !d.provider_is_real} onClick={() => run.mutate()}>{ready ? "Judge again" : "Judge the sample"} · {n(calls)} calls</button>
      </div>
      {run.isError && <div className="alert error">{run.error.message}</div>}
    </section>}

    <div className="sc-cards">
      {groups.map(g => {
        const r = byGroup[g], m = meta[g];
        return <button key={g} className={`sc-card ${open === g ? "active" : ""} ${r ? "" : "empty"}`} onClick={() => ready && setOpen(open === g ? null : g)} disabled={!ready}>
          <small>{groupTitle(g)}</small>
          <em>{m?.question}</em>
          {r ? <Figure g={r} /> : <><b className="sc-big muted">—</b><span>{n(m?.population)} rows in the group</span></>}
          {r && <span className="sc-sub">sample {n(r.sample)} of {n(r.population)}{r.person.judged ? ` · a person marked ${n(r.person.judged)}: ${r.person.percent ?? "—"}%${r.agreement.both ? `, agrees with the judge on ${r.agreement.agree} of ${r.agreement.both}` : ""}` : ""}</span>}
        </button>;
      })}
    </div>

    {open && ready && <section className="ledger-shell acc-card">
      <div className="ledger-meta"><strong>{groupTitle(open)} · {byGroup[open]?.question}</strong><span>click a row for the judge's reason · mark it yourself if you disagree</span></div>
      <div className="ledger-table-wrap"><table className="ledger-table sc-table"><thead><tr><th>Product</th><th>Older field</th><th>Excel</th><th>The tool</th><th>Judge</th><th>You</th></tr></thead><tbody>
        {rows.isLoading && <tr><td colSpan={6}>Loading…</td></tr>}
        {(rows.data?.rows || []).map(x => <tr key={x.row_number} onClick={() => setSelected(x)} className={selected?.row_number === x.row_number ? "selected" : ""}>
          <td><strong>{x.item_no}</strong><small>{x.product}</small></td>
          <td>{x.legacy || "—"}</td>
          <td>{x.excel.standard_size ? `${x.excel.standard_size} ${x.excel.standard_uom || ""}${x.excel.standard_pack_size ? ` × ${x.excel.standard_pack_size}` : ""}` : "empty"}</td>
          <td>{x.tool.label}</td>
          <td><span className={`status-badge ${verdictTone[x.verdict]}`}>{x.verdict_label}</span></td>
          <td onClick={e => e.stopPropagation()}><span className="sc-you">
            <button className={x.person === "RIGHT" ? "on" : ""} title="Right" onClick={() => mark.mutate({ row: x.row_number, verdict: x.person === "RIGHT" ? null : "CORRECT" })}>✓</button>
            <button className={x.person === "WRONG" ? "on wrong" : ""} title="Wrong" onClick={() => mark.mutate({ row: x.row_number, verdict: x.person === "WRONG" ? null : "WRONG" })}>✕</button>
          </span></td>
        </tr>)}
      </tbody></table></div>
    </section>}

    {selected && <aside className="result-detail">
      <button className="detail-close" onClick={() => setSelected(null)}>×</button>
      <div className="detail-content">
        <p className="eyebrow">Row {selected.row_number} · {groupTitle(selected.group)}</p><h2>{selected.item_no}</h2>
        <div className="detail-badges"><span className={`status-badge ${verdictTone[selected.verdict]}`}>{selected.verdict_label}</span><span className="result-badge">basis: {selected.basis.toLowerCase().replace("_", " ")}</span></div>
        <section className="review-explanation"><p className="eyebrow">The judge's reason</p><h3>{selected.reason}</h3>
          {selected.evidence.length > 0 && <p>Quoted: {selected.evidence.map(e => `“${e.fragment}” (${e.field.replaceAll("_", " ")})`).join(" · ")}</p>}
          {selected.error && <p className="muted">{selected.error}</p>}
        </section>
        <section className="klm-glance"><div className="klm-heading"><h3>What the tool did</h3></div><p className="status-explanation"><b>{selected.tool.label}.</b> {selected.tool.reason}</p></section>
        <section className="detail-section"><div className="detail-section-heading"><h3>Descriptions</h3></div>
          <div className="source-evidence-table">{Object.entries(selected.descriptions).map(([k, v]) => <div key={k}><strong>{k.replaceAll("_", " ")}</strong><span className={v ? "" : "source-missing"}>{v || "No value"}</span></div>)}</div>
        </section>
      </div>
    </aside>}
  </div>;
}
