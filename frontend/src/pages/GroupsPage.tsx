import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getShapes, ShapeRow } from "../api/client";
import { JobTabs } from "./JobTabs";

const groupTone: Record<string, string> = { A: "tone-no-change", B: "tone-auto-apply", C: "tone-observation-only", INVALID: "tone-invalid" };
const order = ["A", "B", "C", "INVALID"];

export function GroupsPage() {
  const { jobId = "" } = useParams();
  const shapes = useQuery({ queryKey: ["shapes"], queryFn: getShapes });
  const [has, setHas] = useState<Record<string, boolean>>({ I: true, J: true, K: false, L: false, M: false });
  const d = shapes.data;
  const match = d?.rows.find(r => "IJKLM".split("").every(k => r.has[k] === has[k]));
  const grouped = order.map(g => ({ g, rows: (d?.rows || []).filter(r => r.group === g) }));

  return <div className="results-page acc-page">
    <header className="results-header">
      <div><p className="eyebrow">Groups</p><h1>How every row is sorted</h1><p>Five boxes decide everything. Which of them are filled tells the tool what its job is for that row.</p></div>
      <Link className="secondary" to="/">← Back to conversation</Link>
    </header>
    {jobId && <JobTabs jobId={jobId} active="groups" />}
    {shapes.isError && <div className="alert error">{shapes.error.message}</div>}
    {d && <>
      <section className="ledger-shell acc-card">
        <div className="ledger-meta"><strong>The five boxes</strong><span>columns in the workbook</span></div>
        <div className="gp-boxes">
          {d.fields.map(f => <div key={f.key} className={`gp-box ${f.key === "I" || f.key === "J" ? "old" : "new"}`}><small>Column {f.column}{f.key === "I" || f.key === "J" ? " · old" : " · standard"}</small><strong>{f.name}</strong><em>e.g. {f.example}</em><p>{f.story}</p></div>)}
        </div>
        <p className="acc-note">I and J are what the old system knew. K, L and M are what the business wants: one size, one of three units (GM, ML, EA), and a pack count. The tool's whole job is to get K, L and M right.</p>
      </section>

      <section className="ledger-shell acc-card">
        <div className="ledger-meta"><strong>The groups</strong><span>one line each</span></div>
        <div className="gp-groups">
          {order.map(g => <article key={g} className="gp-group"><span className={`status-badge ${groupTone[g]}`}>{d.groups[g].name}</span><p>{d.groups[g].story}</p></article>)}
        </div>
      </section>

      <section className="ledger-shell acc-card">
        <div className="ledger-meta"><strong>Try it</strong><span>flip the boxes and see where the row goes</span></div>
        <div className="gp-try">
          <div className="gp-switches">{d.fields.map(f => <button key={f.key} className={`gp-switch ${has[f.key] ? "on" : ""}`} onClick={() => setHas(h => ({ ...h, [f.key]: !h[f.key] }))}><small>{f.column}</small><strong>{f.name}</strong><em>{has[f.key] ? "filled" : "empty"}</em></button>)}</div>
          {match && <div className="gp-answer"><span className={`status-badge ${groupTone[match.group]}`}>{d.groups[match.group].name}</span><strong>{match.outcome}</strong><p>{match.detail}</p></div>}
        </div>
      </section>

      <section className="ledger-shell acc-card">
        <div className="ledger-meta"><strong>All 32 shapes</strong><span>✓ filled · · empty</span></div>
        <div className="ledger-table-wrap"><table className="ledger-table gp-table"><thead><tr><th>I</th><th>J</th><th>K</th><th>L</th><th>M</th><th>Group</th><th>What happens</th></tr></thead><tbody>
          {grouped.map(({ g, rows }) => [
            <tr key={`h-${g}`} className="acc-section-row"><td colSpan={7}><span className={`dot ${groupTone[g]}`} />{d.groups[g].name} · {rows.length} shapes</td></tr>,
            ...rows.map((r: ShapeRow, i) => <tr key={`${g}-${i}`}>{"IJKLM".split("").map(k => <td key={k} className={`gp-cell ${r.has[k] ? "on" : ""}`}>{r.has[k] ? "✓" : "·"}</td>)}<td><span className={`status-badge ${groupTone[r.group]}`}>{r.group === "INVALID" ? "Invalid" : `Group ${r.group}`}</span></td><td><strong>{r.outcome}</strong><small>{r.detail}</small></td></tr>),
          ])}
        </tbody></table></div>
      </section>
    </>}
  </div>;
}
