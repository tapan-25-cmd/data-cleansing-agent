import { useQuery } from "@tanstack/react-query";
import { getReasoningSummary } from "../api/client";

const cohortLabels: Record<string, string> = { OPEN: "Rows still open (needs review, could not determine)", NOTE_SAMPLE: "Sample of rows with a note (should agree)", CORRECT_SAMPLE: "Sample of already-correct rows (false alarms)" };
const tierLabels: Record<string, [string, string]> = { APPLY_CANDIDATE: ["Could apply", "tone-auto-apply"], SUGGEST: ["Suggests", "tone-review-required"], CANNOT_TELL: ["Cannot tell", "tone-unresolved"], FAILED: ["Failed", "tone-skipped"] };

/** The latest shadow run of the reasoning task for this job, or a note that it has not run. */
export function ReasoningTrialBlock({ jobId }: { jobId: string }) {
  const trial = useQuery({ queryKey: ["reasoning", jobId], queryFn: () => getReasoningSummary(jobId), enabled: Boolean(jobId) });
  if (!jobId) return <p className="source-help">Open this page from a workbook to see the latest trial run.</p>;
  if (trial.data?.status !== "READY") return <p className="source-help">The reasoning task has not been run on this workbook yet.</p>;
  const d = trial.data;
  const summary = d.summary;
  return <div className="trial-block">
    <div className="outcome-overview">
      <small>Latest run</small>
      <span className="status-badge tone-all">Rows reasoned <b>{summary.rows.toLocaleString()}</b></span>
      {Object.entries(summary.tiers || {}).map(([k, v]) => <span key={k} className={`status-badge ${tierLabels[k]?.[1] || "tone-all"}`}>{tierLabels[k]?.[0] || k} <b>{v.toLocaleString()}</b></span>)}
      <span className={`status-badge ${(summary.wrong_and_confident || 0) === 0 ? "tone-no-change" : "tone-review-required"}`}>Wrong and confident <b>{summary.wrong_and_confident ?? 0}</b></span>
      <span className="status-badge tone-skipped">Failed calls <b>{summary.failed ?? 0}</b></span>
    </div>
    {d.by_cohort && <div className="ledger-table-wrap"><table className="ledger-table rules-table"><thead><tr><th>Rows checked</th><th>Could apply</th><th>Suggests</th><th>Cannot tell</th><th>Total</th></tr></thead><tbody>
      {Object.entries(d.by_cohort).map(([cohort, counts]) => <tr key={cohort}><td><strong>{cohortLabels[cohort] || cohort}</strong></td><td className="num">{(counts.APPLY_CANDIDATE || 0).toLocaleString()}</td><td className="num">{(counts.SUGGEST || 0).toLocaleString()}</td><td className="num">{(counts.CANNOT_TELL || 0).toLocaleString()}</td><td className="num">{Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString()}</td></tr>)}
    </tbody></table></div>}
    <p className="source-help">Shadow only: these answers are stored and shown in every row drawer. They do not change any value, label, suggestion or download. {d.prompt_version && <>Instructions version {d.prompt_version}.</>}{summary.tokens && <> {(summary.tokens.input / 1000).toFixed(0)}k input tokens.</>}</p>
  </div>;
}
