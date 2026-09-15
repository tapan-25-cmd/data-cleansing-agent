import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { createExport, getJob, getSummary } from "../api/client";

export function ExportPage() {
  const { jobId = "" } = useParams();
  const summary = useQuery({ queryKey: ["summary", jobId], queryFn: () => getSummary(jobId) });
  const job = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJob(jobId),
    refetchInterval: query => query.state.data?.status === "EXPORTING" ? 1500 : false,
  });
  const mutation = useMutation({ mutationFn: () => createExport(jobId), onSuccess: () => job.refetch() });
  const ready = summary.data?.pending_review === 0;
  const exporting = mutation.isPending || job.data?.status === "EXPORTING";
  const exported = job.data?.status === "EXPORTED";
  const error = mutation.error?.message || (job.data?.status === "FAILED" ? job.data.error || "Workbook generation failed." : null);
  return <section className="page narrow">
    <p className="eyebrow">Final output</p><h1>Export readiness</h1>
    <div className="checklist">
      <p className={ready ? "checked" : ""}><span>{ready ? "✓" : "·"}</span>{ready ? "No pending review decisions" : `${summary.data?.pending_review ?? "—"} review decisions still pending`}</p>
      <p className="checked"><span>✓</span>Ruleset version and checksum recorded</p>
      <p className="checked"><span>✓</span>Legacy size and UOM protected by output validation</p>
      <p className="checked"><span>✓</span>Output UOM restricted to EA, GM, ML, FT</p>
    </div>
    {error && <div className="alert error">{error}</div>}
    {exported ? <a className="primary download" href={`/api/jobs/${jobId}/download`}>Download cleansed workbook</a> : <button className="primary" disabled={!ready || exporting} onClick={() => mutation.mutate()}>{exporting ? `${job.data?.progress.stage?.replaceAll("_", " ") ?? "Generating"}…` : job.data?.status === "FAILED" ? "Retry workbook generation" : "Generate workbook"}</button>}
    <Link className="back-link" to={`/jobs/${jobId}/summary`}>Back to summary</Link>
  </section>;
}
