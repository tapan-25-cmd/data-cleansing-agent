import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { approveGroup, decideItem, getConversionGroups, getItems } from "../api/client";

export function GroupBReviewPage() {
  const { jobId = "" } = useParams();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["groups", jobId], queryFn: () => getConversionGroups(jobId) });
  const noRuleItems = useQuery({
    queryKey: ["items", jobId, "B", "PENDING", "NO_RULE"],
    queryFn: () => getItems(jobId, "B", 1, 200, "PENDING", "NO_RULE"),
  });
  const refreshReviewState = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["groups", jobId] }),
      client.invalidateQueries({ queryKey: ["items", jobId, "B"] }),
      client.invalidateQueries({ queryKey: ["summary", jobId] }),
    ]);
  };
  const approval = useMutation({ mutationFn: (ruleId: string) => approveGroup(jobId, ruleId), onSuccess: refreshReviewState });
  const decision = useMutation({ mutationFn: (row: number) => decideItem(jobId, row, "REJECT"), onSuccess: refreshReviewState });
  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Group B</p><h1>Deterministic conversions</h1><p className="lede compact">Approve equivalent conversions as a group. Exceptions and discrepancies stay individual.</p></div><Link to={`/jobs/${jobId}/summary`}>Back to summary</Link></div>
    {approval.error && <div className="alert error">{approval.error.message}</div>}
    <div className="table-wrap"><table><thead><tr><th>Rule</th><th>Conversion</th><th>Factor</th><th>Rows</th><th>Pending</th><th /></tr></thead><tbody>
      {query.data?.groups.map(group => <tr key={String(group.rule_id)}><td><strong>{group.rule_id}</strong></td><td>{group.source_uom ?? "—"} → {group.target_uom ?? "—"}</td><td>{group.factor ?? "—"}</td><td>{group.rows}</td><td>{group.pending}</td><td><button className="small" disabled={group.rule_id === "NO_RULE" || Number(group.pending) === 0 || approval.isPending} onClick={() => approval.mutate(String(group.rule_id))}>Approve group</button></td></tr>)}
    </tbody></table></div>
    {(noRuleItems.data?.total ?? 0) > 0 && <div className="review-stack">
      <div className="page-heading"><div><p className="eyebrow">Individual exceptions</p><h2>No deterministic rule</h2><p className="lede compact">These rows stay unchanged after you acknowledge them.</p></div></div>
      {noRuleItems.data?.items.map(item => <article className="review-card" key={item.row_number}>
        <div className="review-title"><div><span className="status">NO_RULE</span><h2>{item.item_no}</h2><p>{item.context.item_desc_eng || "No English description"}</p></div><strong className="decision-state">{item.review.overall_status}</strong></div>
        <div className="comparison"><div><span>Current</span><strong>{item.original.standard_size ?? "—"} {item.original.standard_uom ?? ""}</strong></div><div><span>Result</span><strong>No change</strong></div></div>
        <div className="card-actions"><button className="secondary" disabled={decision.isPending} onClick={() => decision.mutate(item.row_number)}>Accept no change</button></div>
      </article>)}
    </div>}
  </section>;
}
