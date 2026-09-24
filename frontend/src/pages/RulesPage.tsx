import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getRulesGuide } from "../api/client";
import { JobTabs } from "./JobTabs";
import { ReasoningTrialBlock } from "./ReasoningTrialBlock";

const tabs = [
  ["flow", "The flow"], ["unit_mapping", "Unit mapping"], ["legacy_checks", "Legacy checks"],
  ["description_reading", "Description reading"], ["ai_rules", "AI rules and safety checks"], ["reasoning", "AI reasoning (trial)"],
  ["decisions", "Decisions taken"], ["versions", "Versions"],
] as const;

export function RulesPage() {
  const { jobId = "" } = useParams();
  const [params] = useSearchParams();
  const requested = params.get("section") as typeof tabs[number][0] | null;
  const [tab, setTab] = useState<typeof tabs[number][0]>(requested && tabs.some(([k]) => k === requested) ? requested : "flow");
  const guide = useQuery({ queryKey: ["rules-guide", jobId], queryFn: () => getRulesGuide(jobId || undefined) });
  const g = guide.data;
  return <div className="results-page">
    <header className="results-header">
      <div>
        <p className="eyebrow">Rules</p>
        <h1>What the engine runs, in order</h1>
        <p>Every rule, table and decision the tool uses to check and fill the workbook, written for a non-technical reader. Nothing on this page can be edited; rules change only through a versioned release.</p>
      </div>
      <Link className="secondary" to="/">← Back to conversation</Link>
    </header>
    {jobId && <JobTabs jobId={jobId} active="rules" />}
    {guide.isError && <div className="alert error">{guide.error.message}</div>}
    {g && <>
      <div className="outcome-overview rules-subtabs"><small>Section</small>{tabs.map(([key, label]) => <button key={key} className={`status-badge tone-all ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>{label}</button>)}</div>

      {tab === "flow" && <section className="rules-section">
        <ol className="flow-list">{g.flow.map(step => <li key={step.step}><strong>{step.step}. {step.title}</strong><p>{step.text}</p>{step.steps && <ol className="rule-steps compact">{step.steps.map((line, i) => { const [c, r] = line.split("→"); return <li key={i}><span>{c.trim()}</span><em>{(r || "").trim()}</em></li>; })}</ol>}{step.tab !== "flow" && <button className="link" onClick={() => setTab(step.tab as typeof tab)}>See the details →</button>}</li>)}</ol>
        <h3>The six labels a row can get</h3>
        <div className="label-list">{Object.entries(g.labels).map(([k, v]) => <span key={k} className={`status-badge tone-${k.toLowerCase().replaceAll("_", "-")}`}>{v}</span>)}</div>
      </section>}

      {tab === "unit_mapping" && <section className="rules-section">
        <p className="rules-intro">Table version <strong>{g.unit_mapping.ruleset_version}</strong>. Rounding: {g.unit_mapping.rounding}. A legacy value is converted only with a row from this table; anything else is left blank rather than guessed.</p>
        {g.unit_mapping.readiness && <div className={`alert ${g.unit_mapping.readiness.uncovered_source_uoms?.length ? "warning" : "success"}`}>
          {g.unit_mapping.readiness.uncovered_source_uoms?.length
            ? <>Units in this workbook that are <strong>not</strong> in the table: {g.unit_mapping.readiness.uncovered_source_uoms.join(", ")} ({g.unit_mapping.readiness.uncovered_affected_rows} rows). These rows are left blank or kept with a note until a conversion is agreed.</>
            : <>Every legacy unit in this workbook is in the table.</>}
        </div>}
        <div className="ledger-table-wrap"><table className="ledger-table rules-table"><thead><tr><th>Written as</th><th>Becomes</th><th>Multiply by</th><th>Example</th><th>Notes</th></tr></thead><tbody>
          {g.unit_mapping.rules.map(r => <tr key={r.rule_id} className={r.enabled ? "" : "disabled"}><td><strong>{r.source_uoms.join(", ")}</strong></td><td>{r.target_uom}</td><td className="num">{r.factor}</td><td>{r.example}</td><td className="muted">{r.notes}{!r.enabled && " (switched off)"}</td></tr>)}
        </tbody></table></div>
      </section>}

      {tab === "legacy_checks" && <section className="rules-section">
        <p className="rules-intro">For a product whose three values are already filled in, the legacy value is compared in this order. The first outcome that fits decides the label.</p>
        <div className="ledger-table-wrap"><table className="ledger-table rules-table"><thead><tr><th>#</th><th>Outcome</th><th>Rule</th><th>Label</th><th>Example</th></tr></thead><tbody>
          {g.legacy_checks.map(c => <tr key={c.order}><td className="num">{c.order}</td><td><strong>{c.outcome}</strong></td><td>{c.rule}</td><td><span className={`status-badge tone-${c.result.startsWith("Needs") ? "review-required" : c.result.startsWith("Already") ? "no-change" : "observation-only"}`}>{c.result}</span></td><td className="muted">{c.example}</td></tr>)}
        </tbody></table></div>
      </section>}

      {tab === "description_reading" && <section className="rules-section">
        <h3>Units the reader recognises in the text</h3>
        <div className="ledger-table-wrap"><table className="ledger-table rules-table"><thead><tr><th>Written as</th><th>Read as</th><th>Counted in</th><th>Kind</th></tr></thead><tbody>
          {g.description_reading.units.map(u => <tr key={u.written}><td><strong>{u.written}</strong></td><td>{u.means}</td><td>{u.counted_as}</td><td>{u.kind}</td></tr>)}
        </tbody></table></div>
        <h3>How a count is written</h3>
        <div className="ledger-table-wrap"><table className="ledger-table rules-table"><thead><tr><th>Pattern</th><th>Example</th><th>Meaning</th></tr></thead><tbody>
          {g.description_reading.count_notations.map(n => <tr key={n.pattern}><td><strong>{n.pattern}</strong></td><td>{n.example}</td><td>{n.meaning}</td></tr>)}
        </tbody></table></div>
        <p className="rules-intro">Pack words: {g.description_reading.pack_words.join(", ")}. Chinese counters: {g.description_reading.classifiers.join(" ")}. Chinese numerals: {Object.entries(g.description_reading.numerals).map(([k, v]) => `${k}=${v}`).join(" ")}.</p>
        <h3>Which fields are compared with which</h3>
        <ul className="plain-list">{g.description_reading.pairs.map(p => <li key={p.pair}><strong>{p.pair}</strong>: English and local language of the same field are read together. If one is silent that is not a conflict; if they contradict each other, no side is chosen.</li>)}<li>{g.description_reading.brand_note}</li></ul>
        <h3>Numbers that are never a size</h3>
        <ul className="plain-list">{g.description_reading.not_a_size.map(t => <li key={t}>{t}</li>)}</ul>
      </section>}

      {tab === "ai_rules" && <section className="rules-section">
        <h3>Rules the AI must follow</h3>
        <ol className="plain-list">{g.ai_rules.map(t => <li key={t}>{t}</li>)}</ol>
        <h3>Safety checks applied to every automatic value</h3>
        <div className="ledger-table-wrap"><table className="ledger-table rules-table"><thead><tr><th>Check</th><th>What it means</th></tr></thead><tbody>
          {g.guards.map(x => <tr key={x.code}><td><strong>{x.code.replaceAll("_", " ").toLowerCase()}</strong></td><td>{x.meaning}</td></tr>)}
        </tbody></table></div>
        {g.category_profile && <><h3>Learned from this workbook</h3><p className="rules-intro">From {g.category_profile.validated_rows?.toLocaleString()} rows that were already complete, these categories are treated as liquids, so an ounce is a fluid ounce: <strong>{(g.category_profile.liquid_categories || []).join(", ") || "none"}</strong>. Mixed categories, where a person decides: <strong>{(g.category_profile.mixed_categories || []).join(", ") || "none"}</strong>.</p></>}
      </section>}

      {tab === "reasoning" && <section className="rules-section">
        <div className="detail-badges"><span className="status-badge tone-unresolved">{g.reasoning.status === "SHADOW" ? "Trial, shadow only" : g.reasoning.status}</span><span className="result-badge">instructions {g.reasoning.versions.prompt}</span></div>
        <p className="rules-intro" style={{ marginTop: 12 }}>{g.reasoning.what}</p>
        <p className="rules-intro"><strong>{g.reasoning.status_text}</strong></p>
        <h3>What it sees</h3>
        <ul className="plain-list">{g.reasoning.sees.map(t => <li key={t}>{t}</li>)}</ul>
        <h3>What it never sees</h3>
        <ul className="plain-list">{g.reasoning.never_sees.map(t => <li key={t}>{t}</li>)}</ul>
        <h3>What it returns for every row</h3>
        <ul className="plain-list">{g.reasoning.returns.map(t => <li key={t}>{t}</li>)}</ul>
        <h3>Fixed rules it must follow</h3>
        <ol className="plain-list">{g.reasoning.fixed_rules.map(t => <li key={t}>{t}</li>)}</ol>
        <h3>What happens with its answer</h3>
        <div className="ledger-table-wrap"><table className="ledger-table rules-table"><thead><tr><th>Outcome</th><th>When</th><th>Today</th></tr></thead><tbody>
          {g.reasoning.policy.map(p => <tr key={p.tier}><td><span className={`status-badge ${p.tier.startsWith("Could") ? "tone-auto-apply" : p.tier.startsWith("Suggestion") ? "tone-review-required" : "tone-unresolved"}`}>{p.tier}</span></td><td>{p.when}</td><td className="muted">{p.today}</td></tr>)}
        </tbody></table></div>
        <h3>Safety checks before anything could be written</h3>
        <ul className="plain-list">{g.reasoning.safety_checks.map(t => <li key={t}>{t}</li>)}</ul>
        <h3>How it is tested</h3>
        <ul className="plain-list">{g.reasoning.gate.map(t => <li key={t}>{t}</li>)}</ul>
        <h3>Latest trial on this workbook</h3>
        <ReasoningTrialBlock jobId={jobId} />
      </section>}

      {tab === "decisions" && <section className="rules-section">
        <div className="ledger-table-wrap"><table className="ledger-table rules-table"><thead><tr><th>Decision</th><th>What was decided</th></tr></thead><tbody>
          {g.decisions.map(d => <tr key={d.id}><td><strong>{d.id} · {d.title}</strong></td><td>{d.text}</td></tr>)}
        </tbody></table></div>
        <h3>Questions still open with the business</h3>
        <div className="ledger-table-wrap"><table className="ledger-table rules-table"><thead><tr><th>Question</th><th>Status</th></tr></thead><tbody>
          {g.business_decisions.items.map(d => <tr key={d.id}><td>{d.title}</td><td>{d.status === "DECIDED" ? <span className="status-badge tone-no-change">Decided</span> : <span className="status-badge tone-review-required">Open</span>}{d.decided_note && <small> {d.decided_note}</small>}</td></tr>)}
        </tbody></table></div>
        <p className="rules-intro">Answers recorded on the Open questions tab appear there per category.</p>
      </section>}

      {tab === "versions" && <section className="rules-section">
        <div className="ledger-table-wrap"><table className="ledger-table rules-table"><thead><tr><th>Part</th><th>Current version</th><th>This workbook ran with</th></tr></thead><tbody>
          {Object.entries(g.versions).filter(([k]) => k !== "this_job").map(([k, v]) => {
            const ran = (g.versions.this_job as Record<string, string | null> | null)?.[k];
            return <tr key={k}><td><strong>{k.replaceAll("_", " ")}</strong></td><td>{String(v)}</td><td className={ran && ran !== v ? "up" : "muted"}>{ran ?? "—"}</td></tr>;
          })}
        </tbody></table></div>
        <p className="rules-intro">A workbook processed with an older version shows the older version in the last column. Reprocessing it applies the current rules.</p>
      </section>}
    </>}
  </div>;
}
