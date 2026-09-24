import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { JobTabs } from "./JobTabs";
import { ReasoningTrialBlock } from "./ReasoningTrialBlock";
import { getAgentEvaluations, getAiReadingTest, getLatestEvaluation, runAgentEvaluation, getQuality, getVerificationSample, ResultAccuracyRow, startAiReadingTest, verifyItem } from "../api/client";

const verdictBadge: Record<string, string> = {
  CORRECT: "badge-approved", CORRECT_CATCH: "badge-approved", RULE_APPLIED: "badge-approved",
  AGENT_MISS: "badge-rejected", DATA_PROBLEM: "badge-observation-only", NEEDS_DECISION: "badge-review",
};
const verdictShort: Record<string, string> = {
  CORRECT: "Correct", CORRECT_CATCH: "Correct — stopped it", RULE_APPLIED: "Correct — agreed rule",
  AGENT_MISS: "Agent miss", DATA_PROBLEM: "Problem in your data", NEEDS_DECISION: "Your decision",
};
const verdictHelp: Record<string, string> = {
  CORRECT: "The agent reached the value your team had entered.",
  CORRECT_CATCH: "Something did not add up (500 KG of pasta, grams on a product sold in millilitres), so the agent asked a person instead of writing a value. It was right to stop.",
  RULE_APPLIED: "Example: a twin pack written as 500 ML × 2 by the agent and as 1 EA × 2 in Excel. The agent follows the definition you agreed.",
  AGENT_MISS: "Mostly products where the legacy data holds the whole pack (350 GM) and your team entered one piece (70 GM × 5). Also any time the agent asked a person when it did not need to.",
  DATA_PROBLEM: "Example: the description says 720克 and Excel says 540 GM. The agent read the description correctly. Someone should check the pack.",
  NEEDS_DECISION: "The legacy data and Excel disagree, and nothing else in the workbook says which is right. Listed under “Decisions we need from you”.",
};

const patternLabels: Record<string, string> = {
  capacity: "A number on a container or tool (box, cup, scale)",
  name_or_grade: "A number that is part of the name or grade",
  piece_vs_total: "One piece versus the whole pack",
  bundle: "Bundles and twin packs",
  contents_or_case: "Contents counts and shipping cases",
  decline: "Nothing safe to read — must leave blank",
  local_language: "Sizes written in Chinese",
  plain: "Plain sizes that must keep working",
};

function number(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString();
}

function percent(value: number | null | undefined) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

export function PerformancePage() {
  const { jobId = "" } = useParams();
  const [openCapability, setOpenCapability] = useState<string | null>(null);
  const [openDecision, setOpenDecision] = useState<string | null>(null);
  const [openResult, setOpenResult] = useState<string | null>(null);
  const quality = useQuery({ queryKey: ["quality", jobId], queryFn: () => getQuality(jobId), enabled: Boolean(jobId) });
  const checks = useQuery({ queryKey: ["evaluation-latest"], queryFn: getLatestEvaluation });
  const queryClient = useQueryClient();
  const [sample, setSample] = useState("");
  const aiTest = useQuery({
    queryKey: ["ai-reading-test", jobId], queryFn: () => getAiReadingTest(jobId), enabled: Boolean(jobId),
    refetchInterval: query => query.state.data?.status === "RUNNING" ? 2000 : false,
  });
  const startTest = useMutation({
    mutationFn: ({ limit, onlyUnanswered }: { limit: number | null; onlyUnanswered?: boolean }) => startAiReadingTest(jobId, limit, onlyUnanswered),
    onSuccess: () => aiTest.refetch(),
  });
  const hardCases = useQuery({
    queryKey: ["agent-evaluations"], queryFn: getAgentEvaluations,
    refetchInterval: query => query.state.data?.running ? 3000 : false,
  });
  const runHardCases = useMutation({ mutationFn: runAgentEvaluation, onSuccess: () => hardCases.refetch() });
  const [showHardRows, setShowHardRows] = useState(false);
  const latestRun = hardCases.data?.runs[0];
  const aiStatus = aiTest.data?.status;
  useEffect(() => {
    // The finished run is part of the report, so fetch the rebuilt report once.
    if (aiStatus === "COMPLETED") queryClient.invalidateQueries({ queryKey: ["quality", jobId] });
  }, [aiStatus, jobId, queryClient]);
  const runTest = (available: number) => {
    const limit = sample.trim() ? Math.min(Number(sample), available) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) return;
    const calls = limit ?? available;
    if (window.confirm(`Run the AI reading test on ${calls.toLocaleString()} products?\n\nEach product is one paid AI call, so this makes ${calls.toLocaleString()} paid calls.`)) startTest.mutate({ limit });
  };
  const retestUnanswered = (count: number) => {
    if (window.confirm(`Re-test only the ${count.toLocaleString()} products that got no answer?\n\nThis makes ${count.toLocaleString()} paid AI calls. Every other reading is kept.`)) startTest.mutate({ limit: null, onlyUnanswered: true });
  };

  const report = quality.data;
  const openDecisions = (report?.decisions || []).filter(decision => decision.status === "OPEN" && decision.products_affected > 0);
  const settledDecisions = (report?.decisions || []).filter(decision => decision.status === "DECIDED");

  return <div className="results-page performance-page">
    <header className="results-header">
      <div>
        <p className="eyebrow">Data cleansing agent</p>
        <h1>Agent performance</h1>
        <p>How well the agent performed on your workbook, and the decisions we still need from you to score the rest.</p>
        {report && <div className="ledger-header-metrics"><span><strong>{report.dataset.file_name || "Workbook"}</strong>dataset</span><span><strong>{number(report.dataset.products)}</strong>products</span><span><strong>{report.dataset.departments.join(" · ")}</strong>departments</span></div>}
      </div>
      <Link className="secondary" to="/">← Back to conversation</Link>
    </header>

    <JobTabs jobId={jobId} active="performance" />

    {quality.isLoading && <p className="muted">Measuring the agent on your workbook…</p>}
    {quality.isError && <div className="alert error">{quality.error.message}</div>}

    {report && (overall => <>
      {(!report.engine.processed_with_guards || !report.engine.ai_test_is_current) && <section className="engine-warnings">
        {!report.engine.processed_with_guards && <p className="engine-warning">This workbook was processed by an earlier version of the agent. Upload it again to apply the latest safety checks to your results. The accuracy below already uses the current agent.</p>}
        {!report.engine.ai_test_is_current && <p className="engine-warning">The AI reading score was measured with older instructions ({report.engine.ai_test_prompt_version}). Run the AI reading test again to measure the current ones.</p>}
      </section>}

      <section className="accuracy-headline">
        <div className="headline-figure"><small>Agent accuracy</small><strong>{percent(overall.percent)}</strong></div>
        <div className="headline-text">
          <p>The agent gave the right answer, or correctly stopped a wrong one, on <strong>{number(overall.correct)}</strong> of <strong>{number(overall.scored)}</strong> checks on your own products.</p>
          <div className="headline-facts">
            <span><strong>{number(overall.misses)}</strong>agent misses</span>
            <span><strong>{number(overall.bad_values_stopped)}</strong>questionable values stopped</span>
            <span><strong>{number(overall.data_problems)}</strong>problems found in your data</span>
            <span><strong>{number(overall.awaiting_decision)}</strong>waiting for your decision</span>
          </div>
          <p className="muted">For reference, the agent matches your Excel exactly {percent(overall.match_percent)} of the time. That figure is lower because Excel itself contains mistakes, which the agent is not marked down for here.</p>
        </div>
      </section>

      <section className="performance-section">
        <div className="section-heading"><div><p className="eyebrow">1 · How the accuracy is worked out</p><h2>Where all {number(overall.checks)} checks ended up</h2><p>We took products your team had already completed, hid their answers, let the agent work each one out on its own, and compared. Every check lands in exactly one row, so nothing is hidden.</p></div></div>
        <div className="performance-table-wrap"><table className="performance-table">
          <thead><tr><th>What happened</th><th className="numeric">Products</th><th>How it counts</th></tr></thead>
          <tbody>{overall.breakdown.map(row => <tr key={row.verdict}><td><strong>{row.what_happened}</strong><small>{verdictHelp[row.verdict]}</small></td><td className="numeric">{number(row.products)}</td><td><span className={`result-badge ${verdictBadge[row.verdict]}`}>{row.counts_as}</span></td></tr>)}</tbody>
        </table></div>
        <p className="muted category-note">Agent accuracy = correct ÷ (correct + misses). Products that are not scored are in neither number: for those, nobody can yet say the agent was right or wrong.</p>
      </section>


      <section className="performance-section">
        <div className="section-heading"><div><p className="eyebrow">2 · Accuracy by skill</p><h2>How the agent does at each job</h2><p>The same checks, split by what the agent was doing. Open a row to see real examples.</p></div></div>
        <div className="performance-table-wrap"><table className="performance-table">
          <thead><tr><th>What the agent does</th><th className="numeric">Checks</th><th className="numeric">Correct</th><th className="numeric">Misses</th><th className="numeric">Accuracy</th><th className="numeric">Not scored</th><th /></tr></thead>
          <tbody>{report.capabilities.map(row => {
            const open = openCapability === row.key;
            return <Fragment key={row.key}>
              <tr className={open ? "expanded" : ""}>
                <td><strong>{row.capability}</strong>{row.state === "NOT_MEASURED" && row.available_to_test != null && <small>{number(row.available_to_test)} products are available for this test</small>}{row.run?.finished_at && <small>Measured {new Date(row.run.finished_at).toLocaleDateString()} · AI model {row.run.model_id || "—"} · instructions {row.run.prompt_version || "—"}{row.run.errors ? ` · ${row.run.errors} calls failed and were not scored` : ""}</small>}{row.tested > 0 && <small>Matches Excel exactly: {percent(row.match_percent)}</small>}</td>
                <td className="numeric">{row.tested ? number(row.tested) : "—"}</td>
                <td className="numeric">{row.tested ? number(row.correct) : "—"}</td>
                <td className="numeric">{row.tested ? number(row.misses) : "—"}</td>
                <td className="numeric"><strong className="agreement">{row.tested ? percent(row.accuracy_percent) : "Not measured"}</strong></td>
                <td className="numeric">{row.tested ? number(row.data_problems + row.awaiting_decision) : "—"}</td>
                <td className="numeric"><button className="link-button" onClick={() => setOpenCapability(open ? null : row.key)}>{open ? "Hide" : row.key === "ai_description_reading" && !row.tested ? "Run this test" : row.examples.length ? "See examples" : "How it is tested"}</button></td>
              </tr>
              {open && <tr className="detail-row"><td colSpan={7}>
                <p className="how-tested"><strong>How this was tested.</strong> {row.how_tested}</p>
                {row.key === "ai_description_reading" && <div className="ai-test-control">
                  {aiStatus === "RUNNING" ? <>
                    <strong>Test in progress — {number(aiTest.data?.processed)} of {number(aiTest.data?.total)} products read</strong>
                    <div className="progress-rail"><span style={{ width: `${aiTest.data?.total ? Math.round((aiTest.data.processed || 0) * 100 / aiTest.data.total) : 0}%` }} /></div>
                  </> : <>
                    <p><strong>{row.tested ? "Run the test again" : "Run this test"}.</strong> The AI is shown only the description text of {number(row.available_to_test)} products whose size your team already entered. Each product is one paid AI call.</p>
                    <div className="ai-test-actions"><label>Products to test<input type="number" min={1} max={row.available_to_test || undefined} placeholder={`All ${number(row.available_to_test)}`} value={sample} onChange={event => setSample(event.target.value)} /></label><button className="primary" disabled={startTest.isPending || !row.available_to_test} onClick={() => runTest(row.available_to_test || 0)}>Run AI reading test</button>{row.no_answer > 0 && <button className="secondary" disabled={startTest.isPending} onClick={() => retestUnanswered(row.no_answer)}>Re-test only the {number(row.no_answer)} without an answer</button>}</div>
                    {aiStatus === "FAILED" && <p className="alert error">The last test stopped: {aiTest.data?.error}</p>}
                    {startTest.isError && <p className="alert error">{startTest.error.message}</p>}
                  </>}
                </div>}
                {row.key === "ai_description_reading" && report.ai_history.length > 0 && <>
                  <p className="how-tested"><strong>Every test run.</strong> Compare versions of the AI’s instructions on the same products.</p>
                  <table className="performance-table examples-table history-table">
                    <thead><tr><th>Date</th><th>AI instructions</th><th>Model</th><th className="numeric">Tested</th><th className="numeric">Same answer</th><th className="numeric">Differs</th><th className="numeric">No value</th><th className="numeric">Accuracy</th><th className="numeric">Tokens</th></tr></thead>
                    <tbody>{[...report.ai_history].reverse().map(run => <tr key={run.finished_at}><td>{new Date(run.finished_at).toLocaleString()}{run.mode === "UNANSWERED" && <small>re-test of unanswered</small>}</td><td>{run.prompt_version || "—"}</td><td>{run.model_id || "—"}</td><td className="numeric">{number(run.tested)}</td><td className="numeric">{number(run.same_answer)}</td><td className="numeric">{number(run.differs)}</td><td className="numeric">{number(run.no_answer)}</td><td className="numeric"><strong>{percent(run.accuracy_percent)}</strong></td><td className="numeric">{number(run.input_tokens + run.output_tokens)}</td></tr>)}</tbody>
                  </table>
                </>}
                {row.examples.length > 0 && <table className="performance-table examples-table">
                  <thead><tr><th>Product</th><th>What the agent was given</th><th>Agent’s answer</th><th>Your team’s answer</th><th>Result</th><th>In plain words</th></tr></thead>
                  <tbody>{row.examples.map(example => <tr key={`${example.item_no}-${example.kind}`}>
                    <td><strong>{example.item_no}</strong><small>{example.product}</small></td>
                    <td>{example.source}</td><td>{example.agent}</td><td>{example.excel}</td>
                    <td><span className={`result-badge ${verdictBadge[example.verdict] || "badge-no-change"}`}>{verdictShort[example.verdict] || example.verdict}</span></td>
                    <td>{example.note}</td>
                  </tr>)}</tbody>
                </table>}
                {row.examples.length > 0 && <p className="muted">Showing up to 25 of each kind and a few plain matches. Every product is listed in the <Link to={`/jobs/${jobId}/results`}>results ledger</Link>.</p>}
              </td></tr>}
            </Fragment>;
          })}</tbody>
        </table></div>
      </section>

      <section className="performance-section">
        <div className="section-heading"><div><p className="eyebrow">3 · Safety checks</p><h2>What the agent checked before writing a value</h2><p>A value is only written automatically when it passes these checks. A check never invents a value: it either explains a choice or stops the write and asks a person.</p></div></div>
        <div className="performance-table-wrap"><table className="performance-table">
          <thead><tr><th>What was checked</th><th>What the agent did</th><th className="numeric">Products</th><th>Example from your data</th></tr></thead>
          <tbody>{report.safety_checks.map(check => <tr key={check.key}><td><strong>{check.check}</strong></td><td>{check.effect}</td><td className="numeric">{number(check.products)}</td><td>{check.example}</td></tr>)}{report.safety_checks.length === 0 && <tr><td colSpan={4} className="muted">{report.engine.processed_with_guards ? "No check was triggered in this workbook." : "This workbook was processed before the safety checks existed. Upload it again to apply them."}</td></tr>}</tbody>
        </table></div>
        {report.engine.liquid_categories.length > 0 && <p className="muted category-note">Learned from your own data — sold by volume: {report.engine.liquid_categories.join(", ")}. Sold by both weight and volume: {report.engine.mixed_categories.join(", ") || "none"}.</p>}
      </section>

      <section className="performance-section">
        <div className="section-heading"><div><p className="eyebrow">4 · Tricky descriptions</p><h2>The hard cases the AI must get right</h2><p>{hardCases.data?.cases ?? "…"} real descriptions that once fooled the agent: a “1L” microwave box, a “3KG” kitchen scale, “3.3G” yoghurt, “4L” vinegar that means four-leaf grade. Every change to the AI is tested on them first. The number that must stay at zero is <strong>wrong and confident</strong>: a size written that should not have been.</p></div>
          <button className="secondary" disabled={runHardCases.isPending || hardCases.data?.running} onClick={() => { if (window.confirm(`Test the AI on ${hardCases.data?.cases} tricky descriptions?\n\nThis makes ${hardCases.data?.cases} paid AI calls.`)) runHardCases.mutate(); }}>{hardCases.data?.running ? "Testing…" : "Run this test"}</button>
        </div>
        {runHardCases.isError && <p className="alert error">{runHardCases.error.message}</p>}
        {!latestRun && <p className="muted">Not run yet.</p>}
        {hardCases.data && hardCases.data.runs.length > 0 && <div className="performance-table-wrap"><table className="performance-table">
          <thead><tr><th>Date</th><th>AI instructions</th><th>Model</th><th className="numeric">Cases</th><th className="numeric">Correct</th><th className="numeric">Score</th><th className="numeric">Wrong and confident</th></tr></thead>
          <tbody>{hardCases.data.runs.map(run => <tr key={run.created_at}><td>{run.created_at ? new Date(run.created_at).toLocaleString() : "—"}</td><td>{run.prompt_version || "—"}</td><td>{run.model_id || "—"}</td><td className="numeric">{number(run.cases)}</td><td className="numeric">{number(run.passed)}</td><td className="numeric"><strong className="agreement">{percent(run.pass_percent)}</strong></td><td className="numeric"><span className={`result-badge ${run.wrong_and_confident ? "badge-rejected" : "badge-approved"}`}>{run.wrong_and_confident}</span></td></tr>)}</tbody>
        </table></div>}
        {latestRun && <>
          <div className="performance-table-wrap"><table className="performance-table">
            <thead><tr><th>Kind of difficulty (latest run)</th><th className="numeric">Cases</th><th className="numeric">Correct</th><th className="numeric">Wrong and confident</th></tr></thead>
            <tbody>{latestRun.patterns.map(pattern => <tr key={pattern.pattern}><td>{patternLabels[pattern.pattern] || pattern.pattern}</td><td className="numeric">{pattern.cases}</td><td className="numeric">{pattern.passed}</td><td className="numeric">{pattern.wrong_and_confident}</td></tr>)}</tbody>
          </table></div>
          <button className="link-button show-rows" onClick={() => setShowHardRows(value => !value)}>{showHardRows ? "Hide" : "Show"} every case</button>
          {showHardRows && <div className="performance-table-wrap"><table className="performance-table examples-table">
            <thead><tr><th>Description</th><th>Correct outcome</th><th>AI’s outcome</th><th>Result</th><th>AI’s reason</th></tr></thead>
            <tbody>{latestRun.rows.map(row => <tr key={row.id}><td>{row.text}</td><td>{row.expected}</td><td>{row.answer}</td><td><span className={`result-badge ${row.passed ? "badge-approved" : row.wrong_and_confident ? "badge-rejected" : "badge-review"}`}>{row.passed ? "Correct" : row.wrong_and_confident ? "Wrong and confident" : "Missed"}</span></td><td>{row.rationale || "—"}</td></tr>)}</tbody>
          </table></div>}
        </>}
      </section>

      <section className="performance-section">
        <div className="section-heading"><div><p className="eyebrow">5 · Decisions we need from you</p><h2>Open questions that hold back the score</h2><p>Each answer lets us score the products listed against it. Until then they are left out of the agreement figure rather than guessed.</p></div><span>{openDecisions.length} open</span></div>
        <div className="performance-table-wrap"><table className="performance-table">
          <thead><tr><th>Decision</th><th className="numeric">Products affected</th><th>Example from your data</th><th>What your answer unlocks</th><th /></tr></thead>
          <tbody>{openDecisions.map(decision => {
            const open = openDecision === decision.id;
            return <Fragment key={decision.id}>
              <tr className={open ? "expanded" : ""}>
                <td><strong>{decision.title}</strong></td>
                <td className="numeric">{number(decision.products_affected)}</td>
                <td>{decision.example || "—"}</td>
                <td>{decision.unlocks}</td>
                <td className="numeric"><button className="link-button" onClick={() => setOpenDecision(open ? null : decision.id)}>{open ? "Hide" : "Options"}</button></td>
              </tr>
              {open && <tr className="detail-row"><td colSpan={5}><p className="how-tested"><strong>Why it matters.</strong> {decision.why_it_matters}</p><p className="how-tested"><strong>Your options</strong></p><ol className="decision-options">{decision.options.map(option => <li key={option}>{option}</li>)}</ol></td></tr>}
            </Fragment>;
          })}{openDecisions.length === 0 && <tr><td colSpan={5} className="muted">No open decisions for this workbook.</td></tr>}</tbody>
        </table></div>
        {settledDecisions.length > 0 && <div className="performance-table-wrap settled"><table className="performance-table">
          <thead><tr><th>Already decided</th><th className="numeric">Products</th><th>Your decision</th></tr></thead>
          <tbody>{settledDecisions.map(decision => <tr key={decision.id}><td>{decision.title}</td><td className="numeric">{number(decision.products_affected)}</td><td>{decision.decided_note || (decision.resolution === "AGENT_CORRECT" ? "The agent’s answer is correct" : decision.resolution === "EXCEL_CORRECT" ? "The Excel value is correct" : "Decided")}</td></tr>)}</tbody>
        </table></div>}
      </section>

      <section className="performance-section">
        <div className="section-heading"><div><p className="eyebrow">6 · Check the agent’s real output yourself</p><h2>Verify a sample of what the agent changed in your workbook</h2><p>The accuracy above comes from products with known answers. Here your own reviewers can mark a random sample of the agent’s actual changes Correct or Wrong. It never changes your workbook.</p></div></div>
        <div className="performance-table-wrap"><table className="performance-table">
          <thead><tr><th>What the agent produced</th><th className="numeric">Results</th><th className="numeric">Checked by product text</th><th className="numeric">Confirmed</th><th className="numeric">Verified by reviewer</th><th className="numeric">Correct</th><th className="numeric">Accuracy</th><th>How we know</th><th /></tr></thead>
          <tbody>{(["ACTION", "SUGGESTION"] as const).map(type => <Fragment key={type}>
            <tr className="group-row"><td colSpan={9}>{type === "ACTION" ? "Actions — applied to your workbook automatically" : "Suggestions — left for a person to decide"}</td></tr>
            {report.result_accuracy.rows.filter(row => row.type === type).map(row => {
              const open = openResult === row.key;
              return <Fragment key={row.key}>
                <tr className={open ? "expanded" : ""}>
                  <td><strong>{row.result}</strong>{!row.text_checkable && <small>Cannot be checked against product text — a reviewer decides</small>}</td>
                  <td className="numeric">{number(row.results)}</td>
                  <td className="numeric">{row.text_checkable ? number(row.text_checked) : "—"}</td>
                  <td className="numeric">{row.text_checkable && row.text_checked ? number(row.text_confirmed) : "—"}</td>
                  <td className="numeric">{number(row.verified)}</td>
                  <td className="numeric">{row.verified ? number(row.verified_correct) : "—"}</td>
                  <td className="numeric"><strong className="agreement">{percent(row.accuracy_percent)}</strong></td>
                  <td>{row.basis === "REVIEWER" ? "Reviewer sample" : row.basis === "PRODUCT_TEXT" ? "Product text" : "Not checked yet"}</td>
                  <td className="numeric"><button className="link-button" onClick={() => setOpenResult(open ? null : row.key)}>{open ? "Hide" : "Verify a sample"}</button></td>
                </tr>
                {open && <tr className="detail-row"><td colSpan={9}><ResultDetail jobId={jobId} row={row} /></td></tr>}
              </Fragment>;
            })}
          </Fragment>)}</tbody>
        </table></div>
      </section>

      <section className="performance-section">
        <div className="section-heading"><div><p className="eyebrow">7 · AI reasoning trial</p><h2>What a reasoning pass would do with the rows still open</h2><p>A second AI task reads every source for the rows the rules could not close and answers like a reviewer: which source is right, what it would set, and why. It is a trial: its answers are shown in every row drawer and change nothing. The number that must stay at zero is <strong>wrong and confident</strong>.</p></div><Link to={`/jobs/${jobId}/rules?section=reasoning`} className="secondary">How it works →</Link></div>
        <ReasoningTrialBlock jobId={jobId} />
      </section>

      <section className="performance-section">
        <div className="section-heading"><div><p className="eyebrow">8 · Your workbook</p><h2>What the agent did with every product</h2><p>This is workload, not accuracy: it shows where each product ended up.</p></div></div>
        <div className="performance-table-wrap"><table className="performance-table">
          <thead><tr><th>Outcome</th><th className="numeric">Products</th><th className="numeric">Share of live products</th></tr></thead>
          <tbody>{report.workload.map(row => <tr key={row.key}><td>{row.outcome}</td><td className="numeric">{number(row.products)}</td><td className="numeric">{percent(row.share_percent)}</td></tr>)}</tbody>
        </table></div>
      </section>

      <details className="engineering-checks">
        <summary>Versions and engineering checks (for the delivery team)</summary>
      <div className="engine-strip">
        <span><small>Agent</small><strong>v{report.engine.agent_version}</strong></span>
        <span><small>AI instructions</small><strong>{report.engine.prompt_version}</strong></span>
        <span><small>Conversion rules</small><strong>{report.engine.ruleset_version || "—"}</strong></span>
        <span><small>Safety checks</small><strong>{report.engine.guards_version || "not applied"}</strong></span>
      </div>
        <p className="muted">Fixed scenarios we re-run on every change to make sure agreed behaviour does not regress. They are not a measure of accuracy on your data.</p>
        {checks.data && <table className="performance-table">
          <thead><tr><th>Scenario</th><th>Product</th><th>Expected behaviour</th><th>Confirmed by business</th><th>Check</th></tr></thead>
          <tbody>{checks.data.cases.map(testCase => <tr key={testCase.id}><td>{testCase.plain_language?.question || testCase.scenario}</td><td>{testCase.item_no}</td><td>{testCase.plain_language?.expected_result || "—"}</td><td>{testCase.label_status === "APPROVED" ? "Yes" : "Not yet"}</td><td><span className={`result-badge ${testCase.passed ? "badge-approved" : "badge-rejected"}`}>{testCase.passed ? "Passing" : "Failing"}</span></td></tr>)}</tbody>
        </table>}
      </details>
    </>)(report.accuracy)}
  </div>;
}

function ResultDetail({ jobId, row }: { jobId: string; row: ResultAccuracyRow }) {
  const queryClient = useQueryClient();
  const sample = useQuery({ queryKey: ["verification-sample", jobId, row.key], queryFn: () => getVerificationSample(jobId, row.key) });
  const verify = useMutation({
    mutationFn: ({ rowNumber, verdict }: { rowNumber: number; verdict: "CORRECT" | "WRONG" | null }) => verifyItem(jobId, rowNumber, verdict),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["verification-sample", jobId, row.key] }),
      queryClient.invalidateQueries({ queryKey: ["quality", jobId] }),
    ]),
  });
  const marked = sample.data?.rows.filter(item => item.verdict).length || 0;
  return <>
    {row.examples.length > 0 && <>
      <p className="how-tested"><strong>Checked against product text.</strong> The description is an independent source: the agent worked these out from the legacy or entered data, not from the text.</p>
      <table className="performance-table examples-table">
        <thead><tr><th>Product</th><th>Before</th><th>Legacy data</th><th>Agent’s result</th><th>Description states</th><th>Check</th></tr></thead>
        <tbody>{row.examples.map(example => <tr key={example.item_no}><td><strong>{example.item_no}</strong><small>{example.product}</small></td><td>{example.before}</td><td>{example.legacy || "—"}</td><td>{example.result}</td><td>{example.text}</td><td><span className={`result-badge ${example.confirmed ? "badge-approved" : "badge-rejected"}`}>{example.confirmed ? "Confirmed" : "Does not fit"}</span></td></tr>)}</tbody>
      </table>
    </>}
    <p className="how-tested verify-heading"><strong>Verify a random sample.</strong> {sample.data?.question} These {number(sample.data?.rows.length)} products were picked at random from all {number(sample.data?.total_results)} results of this kind, so your verdicts speak for the whole group. {marked} marked so far. Marking never changes your workbook.</p>
    {sample.isLoading && <p className="muted">Drawing the sample…</p>}
    {sample.data && <table className="performance-table examples-table">
      <thead><tr><th>Product</th><th>Descriptions</th><th>Legacy data</th><th>Before</th><th>Agent’s result</th><th>Your verdict</th></tr></thead>
      <tbody>{sample.data.rows.map(item => <tr key={item.row_number}>
        <td><strong>{item.item_no}</strong>{item.reason && <small>{item.reason}</small>}</td>
        <td>{item.descriptions.map(text => <small key={text} className="description-line">{text}</small>)}</td>
        <td>{item.legacy}</td><td>{item.before}</td><td><strong>{item.result}</strong></td>
        <td className="verdict-cell">
          <button className={`verdict ${item.verdict === "CORRECT" ? "on correct" : ""}`} disabled={verify.isPending} onClick={() => verify.mutate({ rowNumber: item.row_number, verdict: item.verdict === "CORRECT" ? null : "CORRECT" })}>Correct</button>
          <button className={`verdict ${item.verdict === "WRONG" ? "on wrong" : ""}`} disabled={verify.isPending} onClick={() => verify.mutate({ rowNumber: item.row_number, verdict: item.verdict === "WRONG" ? null : "WRONG" })}>Wrong</button>
        </td>
      </tr>)}</tbody>
    </table>}
  </>;
}
