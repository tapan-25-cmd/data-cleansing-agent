import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { decideItem, getItems } from "../api/client";

export function GroupCReviewPage() {
  const { jobId = "" } = useParams();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["items", jobId, "C"], queryFn: () => getItems(jobId, "C", 1, 200) });
  const decision = useMutation({ mutationFn: ({ row, action }: { row: number; action: "APPROVE" | "REJECT" }) => decideItem(jobId, row, action), onSuccess: async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["items", jobId, "C"] }),
      client.invalidateQueries({ queryKey: ["summary", jobId] }),
    ]);
  } });
  const items = [...(query.data?.items ?? [])].sort((left, right) =>
    Number(right.review.overall_status === "PENDING") - Number(left.review.overall_status === "PENDING")
  );
  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Group C</p><h1>Description evidence</h1><p className="lede compact">One item at a time. Missing evidence is a valid and expected outcome.</p></div><Link to={`/jobs/${jobId}/summary`}>Back to summary</Link></div>
    <div className="review-stack">{items.map(item => <article className="review-card" key={item.row_number}>
      <div className="review-title"><div><span className="status">{item.reason_code}</span><h2>{item.item_no}</h2><p>{item.context.item_desc_eng || "No English description"}</p><p className="local-copy">{item.context.item_desc_local_lang}</p></div><strong className="decision-state">{item.review.overall_status}</strong></div>
      <div className="comparison"><div><span>Current</span><strong>{item.original.standard_size ?? "—"} {item.original.standard_uom ?? ""}</strong></div><div><span>Proposed</span><strong>{item.field_proposals.standard_size ?? "—"} {item.field_proposals.standard_uom ?? ""}</strong></div><div><span>Confidence</span><strong>{item.confidence ?? "—"}</strong></div></div>
      {item.evidence.map(evidence => <blockquote key={`${evidence.field}-${evidence.fragment}`}><small>{evidence.field}</small>{evidence.fragment}</blockquote>)}
      {item.review.overall_status === "PENDING" && <div className="card-actions"><button className="secondary" onClick={() => decision.mutate({ row: item.row_number, action: "REJECT" })}>Accept no change</button>{item.field_proposals.standard_uom && <button className="primary" onClick={() => decision.mutate({ row: item.row_number, action: "APPROVE" })}>Approve proposal</button>}</div>}
    </article>)}</div>
  </section>;
}
