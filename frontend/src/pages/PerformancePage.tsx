import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getAiReadingTest, getLatestEvaluation, getQuality, getVerificationSample, QualityCapability, ResultAccuracyRow, startAiReadingTest, verifyItem } from "../api/client";

const stateLabels: Record<QualityCapability["state"], { label: string; badge: string }> = {
  MEASURED: { label: "Measured", badge: "badge-approved" },
  AWAITING_DECISION: { label: "Some products await your decision", badge: "badge-review" },
  NOT_MEASURED: { label: "Not measured yet", badge: "badge-no-change" },
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
  const headline = report?.result_accuracy.headline;
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

    <div className="results-tabs">
      <Link to={`/jobs/${jobId}/results`}>Results ledger</Link>
      <button className="active">Agent performance</button>
    </div>

    {quality.isLoading && <p className="muted">Measuring the agent on your workbook…</p>}
    {quality.isError && <div className="alert error">{quality.error.message}</div>}

    {report && <>
      <section className="accuracy-headline">
        <div className="headline-figure"><small>Accuracy of the agent’s results</small><strong>{percent(headline?.percent)}</strong></div>
        <div className="headline-text">
          {headline?.basis === "REVIEWER"
            ? <p>Your reviewers checked a random sample of <strong>{number(headline.checked)}</strong> of the agent’s {number(headline.results)} results and marked <strong>{number(headline.correct)}</strong> as correct.</p>
            : headline?.basis === "PRODUCT_TEXT"
              ? <p>Of the agent’s {number(headline.results)} results, <strong>{number(headline.checked)}</strong> could be checked automatically against the product’s own description, and <strong>{number(headline.correct)}</strong> were confirmed. <em>This is a small share of the results, so treat it as a first signal.</em> Verify a random sample below and your reviewers’ verdicts become the headline once {number(headline.min_verified_for_headline)} results are checked ({number(headline.verified)} so far).</p>
              : <p>None of the agent’s results have been checked yet. Verify a random sample below to measure accuracy.</p>}
          {report.accuracy.percent != null && <p className="muted">For comparison, in a blind test on {number(report.accuracy.checks)} products with known answers the same engine was right <strong>{percent(report.accuracy.percent)}</strong> of the time (section 2).</p>}
        </div>
      </section>

      <section className="performance-section">
        <div className="section-heading"><div><p className="eyebrow">1 · Accuracy of what the agent produced</p><h2>Every action it took and every suggestion it made</h2><p>Two independent checks. <strong>Product text</strong>: where the description states a size, does it confirm the agent’s result? This only applies when the agent did not get its result from that same text. <strong>Reviewer</strong>: a person marks a random sample Correct or Wrong — the strongest evidence, and it never changes your workbook.</p></div></div>
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
        <div className="section-heading"><div><p className="eyebrow">2 · How we tested the agent before trusting it</p><h2>A blind test on products with known answers</h2><p>A blind test on products your team had already completed. We hid their answers, let the agent work each one out on its own, and compared the two. Where they differ we do not assume the agent is wrong — either side may be — so those products wait for your decision instead of counting as errors.</p></div></div>
        <div className="performance-table-wrap"><table className="performance-table">
          <thead><tr><th>What the agent does</th><th className="numeric">Products tested</th><th className="numeric">Same answer as your team</th><th className="numeric">Accuracy</th><th className="numeric">Awaiting your decision</th><th>Status</th><th /></tr></thead>
          <tbody>{report.capabilities.map(row => {
            const open = openCapability === row.key;
            return <Fragment key={row.key}>
              <tr className={open ? "expanded" : ""}>
                <td><strong>{row.capability}</strong>{row.state === "NOT_MEASURED" && row.available_to_test != null && <small>{number(row.available_to_test)} products are available for this test</small>}{row.no_answer > 0 && <small>The AI gave no answer for {number(row.no_answer)} of these; they count as tested, not as agreement</small>}{row.run?.finished_at && <small>Measured {new Date(row.run.finished_at).toLocaleDateString()} · AI model {row.run.model_id || "—"} · instructions {row.run.prompt_version || "—"}{row.run.errors ? ` · ${row.run.errors} calls failed and were not scored` : ""}</small>}{row.confirmed_correct + row.confirmed_incorrect > 0 && <small>After your decisions: {number(row.confirmed_correct)} confirmed in the agent’s favour, {number(row.confirmed_incorrect)} against</small>}</td>
                <td className="numeric">{row.tested ? number(row.tested) : "—"}</td>
                <td className="numeric">{row.tested ? number(row.agreed) : "—"}</td>
                <td className="numeric"><strong className="agreement">{percent(row.accuracy_percent)}</strong></td>
                <td className="numeric">{row.tested ? number(row.awaiting_decision) : "—"}</td>
                <td><span className={`result-badge ${stateLabels[row.state].badge}`}>{stateLabels[row.state].label}</span></td>
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
                {row.examples.length > 0 && <table className="performance-table examples-table">
                  <thead><tr><th>Product</th><th>What the agent was given</th><th>Agent’s answer</th><th>Your team’s answer</th><th>Result</th><th>In plain words</th></tr></thead>
                  <tbody>{row.examples.map(example => <tr key={`${example.item_no}-${example.kind}`}>
                    <td><strong>{example.item_no}</strong><small>{example.product}</small></td>
                    <td>{example.source}</td><td>{example.agent}</td><td>{example.excel}</td>
                    <td><span className={`result-badge ${example.agrees ? "badge-approved" : example.kind === "NO_ANSWER" ? "badge-no-change" : "badge-review"}`}>{example.agrees ? "Same answer" : example.kind === "NO_ANSWER" ? "No answer" : "Differs — your decision"}</span></td>
                    <td>{example.note}</td>
                  </tr>)}</tbody>
                </table>}
                {row.examples.length > 0 && <p className="muted">Showing up to 25 differences and a few matches. Every product is listed in the <Link to={`/jobs/${jobId}/results`}>results ledger</Link>.</p>}
              </td></tr>}
            </Fragment>;
          })}</tbody>
        </table></div>
      </section>

      <section className="performance-section">
        <div className="section-heading"><div><p className="eyebrow">3 · Decisions we need from you</p><h2>Open questions that hold back the score</h2><p>Each answer lets us score the products listed against it. Until then they are left out of the agreement figure rather than guessed.</p></div><span>{openDecisions.length} open</span></div>
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
        <div className="section-heading"><div><p className="eyebrow">4 · Your workbook</p><h2>What the agent did with every product</h2><p>This is workload, not accuracy: it shows where each product ended up.</p></div></div>
        <div className="performance-table-wrap"><table className="performance-table">
          <thead><tr><th>Outcome</th><th className="numeric">Products</th><th className="numeric">Share of live products</th></tr></thead>
          <tbody>{report.workload.map(row => <tr key={row.key}><td>{row.outcome}</td><td className="numeric">{number(row.products)}</td><td className="numeric">{percent(row.share_percent)}</td></tr>)}</tbody>
        </table></div>
      </section>

      <details className="engineering-checks">
        <summary>Engineering checks (for the delivery team)</summary>
        <p className="muted">Fixed scenarios we re-run on every change to make sure agreed behaviour does not regress. They are not a measure of accuracy on your data.</p>
        {checks.data && <table className="performance-table">
          <thead><tr><th>Scenario</th><th>Product</th><th>Expected behaviour</th><th>Confirmed by business</th><th>Check</th></tr></thead>
          <tbody>{checks.data.cases.map(testCase => <tr key={testCase.id}><td>{testCase.plain_language?.question || testCase.scenario}</td><td>{testCase.item_no}</td><td>{testCase.plain_language?.expected_result || "—"}</td><td>{testCase.label_status === "APPROVED" ? "Yes" : "Not yet"}</td><td><span className={`result-badge ${testCase.passed ? "badge-approved" : "badge-rejected"}`}>{testCase.passed ? "Passing" : "Failing"}</span></td></tr>)}</tbody>
        </table>}
      </details>
    </>}
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
