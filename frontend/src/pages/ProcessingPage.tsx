import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { getJob } from "../api/client";

const stages = ["VALIDATING", "PROFILING", "PROCESSING_RULES", "PROCESSING_DESCRIPTIONS", "CHECKING_DISCREPANCIES", "READY_FOR_REVIEW"];

export function ProcessingPage() {
  const { jobId = "" } = useParams();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["job", jobId], queryFn: () => getJob(jobId), refetchInterval: (result) => result.state.data?.status === "READY_FOR_REVIEW" ? false : 1200,
  });
  const job = query.data;
  const current = Math.max(0, stages.indexOf(job?.progress.stage ?? "VALIDATING"));
  if (job?.status === "READY_FOR_REVIEW") setTimeout(() => navigate(`/jobs/${jobId}/summary`), 500);

  return <section className="page narrow processing">
    <p className="eyebrow">Run in progress</p>
    <h1>Reading every row. Changing nothing yet.</h1>
    <p className="lede">Rules and inference produce proposals only. Commercial review remains the gate before export.</p>
    {job?.status === "FAILED" ? <div className="alert error">{job.error}</div> : <>
      <div className="progress"><span style={{ width: `${((current + 1) / stages.length) * 100}%` }} /></div>
      <ol className="stage-list">{stages.map((stage, index) => <li className={index <= current ? "done" : ""} key={stage}><span>{index < current ? "✓" : index + 1}</span>{stage.replaceAll("_", " ").toLowerCase()}</li>)}</ol>
    </>}
  </section>;
}
