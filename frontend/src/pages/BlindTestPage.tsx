import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { BlindMutation, BlindTestDoc, getBlindTestRows, getBlindTests, runBlindTest } from "../api/client";
import { JobTabs } from "./JobTabs";

const n = (v: unknown) => (typeof v === "number" ? v.toLocaleString() : "—");
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const pct = (a: number, b: number) => (b ? `${(100 * a / b).toFixed(1)}%` : "—");
const when = (v?: string) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");

export function BlindTestPage() {
  const { jobId = "" } = useParams();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const data = useQuery({ queryKey: ["blind-tests", jobId], queryFn: () => getBlindTests(jobId), enabled: Boolean(jobId), refetchInterval: q => (Object.values(q.state.data?.tests || {}).some(t => t.status === "RUNNING") ? 3000 : false) });
  const rows = useQuery({ queryKey: ["blind-test-rows", jobId, open, page], queryFn: () => getBlindTestRows(jobId, open!, page), enabled: Boolean(open) });
  const run = useMutation({ mutationFn: (kind: string) => runBlindTest(jobId, kind), onSuccess: () => qc.invalidateQueries({ queryKey: ["blind-tests", jobId] }) });
  const d = data.data;
  const A = d?.tests.A, B = d?.tests.B, C = d?.tests.C_SILENT;
  const sA = (A?.summary || {}) as Record<string, unknown>, sB = (B?.summary || {}) as Record<string, unknown>, sC = (C?.summary || {}) as Record<string, unknown>;
  const mutations = (sA.mutations as BlindMutation[] | undefined) || d?.mutations || [];
  const rt = d?.reading_test?.score || null;

  return <div className="results-page acc-page">
    <header className="results-header">
      <div><p className="eyebrow">Accuracy · Blind test</p><h1>Tests where the right answer is known first</h1><p>Each part of the tool is tested on answers that exist before it runs and are hidden from it. Nothing here changes the workbook.</p></div>
      <Link className="secondary" to="/">← Back to conversation</Link>
    </header>
    <JobTabs jobId={jobId} active="accuracy" />
    <div className="acc-subnav"><Link to={`/jobs/${jobId}/accuracy`}>Accuracy</Link><button className="active">Blind test</button><Link to={`/jobs/${jobId}/sample-check`}>Sample check</Link></div>
    {data.isError && <div className="alert error">{data.error.message}</div>}

    {d && <>
      <TestCard
        title="The unit table · Conversion test" cost="No AI calls · runs in seconds" doc={B} onRun={() => run.mutate("B")} onRows={() => { setOpen("B"); setPage(1); }}
        hidden="The team's size, unit and pack size (K, L, M) of every complete product whose older field is in a different unit."
        answer="The tool converts the older field with the unit table, as it does when K and L are empty, and its result is compared with the team's value."
        result={B?.status === "READY" ? <>
          <Big value={pct(num(sB.conversion_agree) + num(sB.conversion_whole_pack), num(sB.needed_conversion))} label={`${n(num(sB.conversion_agree) + num(sB.conversion_whole_pack))} of ${n(sB.needed_conversion)} conversions reproduce the team's value`} />
          <ul className="bt-facts">
            <li><b>{n(sB.conversion_agree)}</b> give exactly the team's unit size</li>
            <li><b>{n(sB.conversion_whole_pack)}</b> give the team's whole pack, size × pack size</li>
            <li><b>{n(sB.conversion_differ)}</b> give a different value <em>(listed below)</em></li>
            <li><b>{n(sB.conversion_no_rule)}</b> use a unit the table does not know</li>
            <li><b>{n(sB.same_unit_agree)}</b> of {n(sB.same_unit)} products in the same unit copy across unchanged</li>
            <li><b>{n(sB.packs_found_in_text)}</b> of {n(sB.packs_over_one)} pack sizes above 1 are written in the description</li>
          </ul>
        </> : null}
        proves="The unit table and its rounding reproduce what the team entered, and exactly where they do not." limit="The team's values are the answer key, so a disagreement can be a data error as easily as a tool error; both values are shown." />

      <TestCard
        title="The checker · Seeded-error test" cost="No AI calls · about two minutes" doc={A} onRun={() => run.mutate("A")} onRows={() => { setOpen("A"); setPage(1); }}
        hidden="Nothing is hidden. Instead, complete products the tool had accepted are deliberately broken, one error at a time, in six realistic ways."
        answer="Each broken copy goes through the check for filled-in values. Caught means the tool refused to keep it and raised it for a person; noted means it kept the value with a remark; missed means it accepted it."
        result={A?.status === "READY" ? <>
          <Big value={pct(num(sA.caught), num(sA.tested))} label={`${n(sA.caught)} of ${n(sA.tested)} seeded errors caught · ${n(sA.products)} products × up to 6 errors each`} />
          <table className="bt-table"><thead><tr><th>Kind of error</th><th>Tested</th><th>Caught</th><th>Noted only</th><th>Missed</th><th>Catch rate</th></tr></thead><tbody>
            {mutations.map(m => <tr key={m.id}><td><strong>{m.name}</strong><small>{m.why}</small></td><td className="num">{n(m.tested)}</td><td className="num good">{n(m.CAUGHT)}</td><td className="num">{n(m.NOTED_ONLY)}</td><td className="num bad">{n(m.MISSED)}</td><td className="num"><b>{pct(num(m.CAUGHT), num(m.tested))}</b></td></tr>)}
          </tbody></table>
          <p className="bt-note">Untouched copies flagged by mistake: <b>{n(sA.untouched_flagged)}</b> of {n(sA.products)}.</p>
        </> : null}
        proves="If a value were wrong in one of these ways, whether the checker would see it. This is what the accuracy page cannot show, because it only sees the errors that exist." limit="A rounding slip of one gram is meant to be allowed, so a low catch rate there is by design. The size-as-total error can only be caught when the older field or the text says otherwise." />

      <TestCard
        title="The reader · Reading test" cost="One AI call per product" doc={C} onRun={() => run.mutate("C_SILENT")} onRows={() => { setOpen("C_SILENT"); setPage(1); }} runLabel="Run the silent-text half"
        hidden="Two halves. Positive: products whose description states the size the team entered; K, L, M hidden, only the text shown. Negative: 200 products whose descriptions state no size at all."
        answer="Positive: the reader must find the team's size in the text. Negative: the reader must answer that nothing is written. Inventing a size is a hard fail."
        result={<>
          <div className="bt-halves">
            <div><small>Positive half · reads what is written</small>{rt ? <><Big value={pct(rt.agreed, rt.tested)} label={`${n(rt.agreed)} of ${n(rt.tested)} read the team's value`} /><Link className="status-badge tone-all" to={`/jobs/${jobId}/performance`}>Run or inspect on Agent performance →</Link></> : <p className="bt-note">Not run on this workbook yet. Start it from the Agent performance page.</p>}</div>
            <div><small>Negative half · invents nothing</small>{C?.status === "READY" ? <Big value={pct(num(sC.correct_silence), num(sC.tested) - num(sC.failed))} label={`${n(sC.correct_silence)} of ${n(num(sC.tested) - num(sC.failed))} answered "nothing written" · ${n(sC.invented_size)} invented a size · ${n(sC.failed)} failed calls`} /> : <p className="bt-note">Not run yet.</p>}</div>
          </div>
        </>}
        proves="The two halves of the reader's claim: it reads what is written, and writes nothing when nothing is written." limit="The positive answer key is the team's own entries and inherits their mistakes; every disagreement is listed with both values." />
    </>}

    {open && <aside className="result-detail" role="dialog" aria-modal="true">
      <button className="detail-close" onClick={() => setOpen(null)}>×</button>
      <div className="detail-content">
        <p className="eyebrow">Blind test · {open === "A" ? "The checker" : open === "B" ? "The unit table" : "The reader"}</p><h2>{open === "A" ? "Errors not caught" : open === "B" ? "Where the table and the team differ" : "Sizes invented or calls failed"}</h2>
        <section className="detail-section">
          <div className="detail-section-heading"><h3>Products</h3><span>{rows.data ? `${n(rows.data.total)} · page ${rows.data.page} of ${Math.max(1, Math.ceil(rows.data.total / rows.data.page_size))}` : "…"}</span></div>
          <div className="detail-findings">{(rows.data?.rows || []).map((x, i) => <article key={i}>
            <div className="detail-badges"><strong>{String(x.item_no)}</strong><span className="result-badge">{String(x.verdict || x.mutation || "")}</span>{x.mutation ? <span className="result-badge">{mutations.find(m => m.id === x.mutation)?.name}</span> : null}</div>
            <p>{String(x.product || "")}</p>
            <small>{x.legacy ? `Older field ${String(x.legacy)} · ` : ""}Team {String(x.team || "")}{x.tool ? ` · tool ${String(x.tool)}` : ""}{x.broken ? ` · broken to ${String(x.broken)}` : ""}{x.read ? ` · reader wrote ${String(x.read)}` : ""}{x.pack ? ` · pack ${String(x.pack).toLowerCase().replaceAll("_", " ")}` : ""}</small>
            {x.rationale ? <small>{String(x.rationale)}</small> : null}{x.codes ? <small>{(x.codes as string[]).join(", ") || "no finding"}</small> : null}
          </article>)}</div>
          {rows.data && rows.data.total > rows.data.page_size && <div className="ledger-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><button className="secondary" disabled={page * rows.data.page_size >= rows.data.total} onClick={() => setPage(p => p + 1)}>Next</button></div>}
        </section>
      </div>
    </aside>}
  </div>;
}

function Big({ value, label }: { value: string; label: string }) {
  return <div className="bt-big"><strong>{value}</strong><span>{label}</span></div>;
}

function TestCard({ title, cost, doc, onRun, onRows, hidden, answer, result, proves, limit, runLabel }: { title: string; cost: string; doc?: BlindTestDoc; onRun: () => void; onRows: () => void; hidden: string; answer: string; result: React.ReactNode; proves: string; limit: string; runLabel?: string }) {
  const running = doc?.status === "RUNNING";
  return <section className="ledger-shell acc-card">
    <div className="ledger-meta"><strong>{title}</strong><span>{cost}{doc?.finished_at ? ` · last run ${when(doc.finished_at)}` : ""}</span></div>
    <div className="bt-grid">
      <div className="bt-setup">
        <p><strong>What is hidden</strong>{hidden}</p>
        <p><strong>What counts as right</strong>{answer}</p>
        <div className="bt-actions"><button onClick={onRun} disabled={running}>{running ? "Running…" : (runLabel || (doc?.status === "READY" ? "Run again" : "Run this test"))}</button>{doc?.status === "READY" && <button className="secondary" onClick={onRows}>See the products</button>}</div>
        {doc?.status === "FAILED" && <div className="alert error">The test did not finish: {doc.error}</div>}
      </div>
      <div className="bt-result">{result || <p className="bt-note">{running ? "Running now; this page refreshes by itself." : "Not run yet."}</p>}</div>
    </div>
    <div className="bt-footer"><span><strong>Proves</strong>{proves}</span><span><strong>Does not prove</strong>{limit}</span></div>
  </section>;
}
