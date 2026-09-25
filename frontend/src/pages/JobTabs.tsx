import { Link } from "react-router-dom";

const tabs = [
  { key: "results", label: "Results ledger", path: "results" },
  { key: "accuracy", label: "Accuracy", path: "accuracy" },
  { key: "performance", label: "Agent performance", path: "performance" },
  { key: "comparison", label: "Past vs New", path: "comparison" },
  { key: "questions", label: "Open questions", path: "open-questions" },
  { key: "groups", label: "Groups", path: "groups" },
  { key: "rules", label: "Rules", path: "rules" },
  { key: "pipeline", label: "Pipeline", path: "pipeline" },
  { key: "sequence", label: "Sequence", path: "sequence" },
  { key: "accuracy-rules", label: "Accuracy rules", path: "accuracy-rules" },
];

export function JobTabs({ jobId, active }: { jobId: string; active: string }) {
  return <div className="results-tabs">
    {tabs.map(tab => tab.key === active
      ? <button key={tab.key} className="active">{tab.label}</button>
      : <Link key={tab.key} to={`/jobs/${jobId}/${tab.path}`}>{tab.label}</Link>)}
  </div>;
}
