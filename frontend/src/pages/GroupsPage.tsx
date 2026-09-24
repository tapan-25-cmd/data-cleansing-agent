import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getJob, getShapes, GROUP_LABELS_OF, GROUP_TONES, OutcomeGroup, ShapeRow } from "../api/client";
import { JobTabs } from "./JobTabs";

const GROUP_ORDER: OutcomeGroup[] = ["A", "B", "C", "PURGED"];
const ROUTE_ORDER = ["A", "B", "C", "INCOMPLETE"];

function GroupBadges({ groups }: { groups: OutcomeGroup[] }) {
  return <span className="gp-badges">{groups.map(g => <span key={g} className={`status-badge ${GROUP_TONES[g]}`}>{g === "PURGED" ? "Purged" : `Group ${g}`}</span>)}</span>;
}

export function GroupsPage() {
  const { jobId = "" } = useParams();
  const shapes = useQuery({ queryKey: ["shapes"], queryFn: getShapes });
  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => getJob(jobId), enabled: Boolean(jobId) });
  const [has, setHas] = useState<Record<string, boolean>>({ I: true, J: true, K: false, L: false, M: false });
  const d = shapes.data;
  const counts = job.data?.stats.groups;
  const match = d?.rows.find(r => "IJKLM".split("").every(k => r.has[k] === has[k]));
  const byRoute = ROUTE_ORDER.map(route => ({ route, rows: (d?.rows || []).filter(r => r.route === route) }));

  return <div className="results-page acc-page">
    <header className="results-header">
      <div><p className="eyebrow">Groups</p><h1>How every row is sorted</h1><p>The group is the result: what the tool did to K, L and M. It is decided at the very end, after the row has been worked on.</p></div>
      <Link className="secondary" to="/">← Back to conversation</Link>
    </header>
    {jobId && <JobTabs jobId={jobId} active="groups" />}
    {shapes.isError && <div className="alert error">{shapes.error.message}</div>}
    {d && <>
      <section className="ledger-shell acc-card">
        <div className="ledger-meta"><strong>The groups</strong><span>{counts ? "rows in this run" : "decided from each row's final label"}</span></div>
        <div className="gp-groups">
          {GROUP_ORDER.map(g => <article key={g} className="gp-group">
            <div className="gp-group-head"><span className={`status-badge ${GROUP_TONES[g]}`}>{d.groups[g].name}</span>{counts && <b>{(counts[g] ?? 0).toLocaleString()}</b>}</div>
            <p>{d.groups[g].story}</p>
            <ul className="gp-labels">{GROUP_LABELS_OF[g].map(label => <li key={label}>{label}</li>)}</ul>
          </article>)}
        </div>
        <p className="acc-note">A person's later decision does not move a row: a raised row stays in Group C after it is answered.</p>
      </section>

      <section className="ledger-shell acc-card">
        <div className="ledger-meta"><strong>The five boxes</strong><span>columns in the workbook</span></div>
        <div className="gp-boxes">
          {d.fields.map(f => <div key={f.key} className={`gp-box ${f.key === "I" || f.key === "J" ? "old" : "new"}`}><small>Column {f.column}{f.key === "I" || f.key === "J" ? " · old" : " · standard"}</small><strong>{f.name}</strong><em>e.g. {f.example}</em><p>{f.story}</p></div>)}
        </div>
        <p className="acc-note">I and J are what the old system knew. K, L and M are what the business wants: one size, one of three units (GM, ML, EA), and a pack count. Which boxes are filled decides how the tool works on the row.</p>
      </section>

      <section className="ledger-shell acc-card">
        <div className="ledger-meta"><strong>How the tool works on a row</strong><span>chosen from the boxes, before any result</span></div>
        <div className="gp-groups gp-routes">
          {ROUTE_ORDER.map(route => <article key={route} className="gp-group"><strong>{d.routes[route].name}</strong><p>{d.routes[route].story}</p></article>)}
        </div>
      </section>

      <section className="ledger-shell acc-card">
        <div className="ledger-meta"><strong>Try it</strong><span>flip the boxes and see what happens</span></div>
        <div className="gp-try">
          <div className="gp-switches">{d.fields.map(f => <button key={f.key} className={`gp-switch ${has[f.key] ? "on" : ""}`} onClick={() => setHas(h => ({ ...h, [f.key]: !h[f.key] }))}><small>{f.column}</small><strong>{f.name}</strong><em>{has[f.key] ? "filled" : "empty"}</em></button>)}</div>
          {match && <div className="gp-answer"><small>{match.route_name}</small><strong>{match.outcome}</strong><p>{match.detail}</p><div><small>Can end in</small> <GroupBadges groups={match.groups} /></div></div>}
        </div>
      </section>

      <section className="ledger-shell acc-card">
        <div className="ledger-meta"><strong>All 32 shapes</strong><span>✓ filled · · empty</span></div>
        <div className="ledger-table-wrap"><table className="ledger-table gp-table"><thead><tr><th>I</th><th>J</th><th>K</th><th>L</th><th>M</th><th>What happens</th><th>Can end in</th></tr></thead><tbody>
          {byRoute.map(({ route, rows }) => [
            <tr key={`h-${route}`} className="acc-section-row"><td colSpan={7}>{d.routes[route].name} · {rows.length} shapes</td></tr>,
            ...rows.map((r: ShapeRow, i) => <tr key={`${route}-${i}`}>{"IJKLM".split("").map(k => <td key={k} className={`gp-cell ${r.has[k] ? "on" : ""}`}>{r.has[k] ? "✓" : "·"}</td>)}<td><strong>{r.outcome}</strong><small>{r.detail}</small></td><td><GroupBadges groups={r.groups} /></td></tr>),
          ])}
        </tbody></table></div>
      </section>
    </>}
  </div>;
}
