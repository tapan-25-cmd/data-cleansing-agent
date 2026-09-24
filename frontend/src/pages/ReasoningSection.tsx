import { useQuery } from "@tanstack/react-query";
import { ComparisonValues, getReasoningRow } from "../api/client";

const verdictLabels: Record<string, string> = {
  EXCEL_RIGHT: "Excel is right", LEGACY_RIGHT: "The legacy value is right", DESCRIPTION_RIGHT: "The description is right",
  COMBINED: "Sources combine into one answer", CANNOT_TELL: "Cannot tell from the text",
};
const tierLabels: Record<string, [string, string]> = {
  APPLY_CANDIDATE: ["Could apply automatically", "tone-auto-apply"],
  SUGGEST: ["Suggestion for a person", "tone-review-required"],
  CANNOT_TELL: ["Stays with a person", "tone-unresolved"],
};
const meaningLabels: Record<string, string> = {
  PER_PIECE: "amount in one piece", WHOLE_PACK: "the whole pack", PACKAGE_COUNT: "number of packages", PIECE_COUNT: "number of pieces",
  NOT_A_SIZE: "not a size", SILENT: "says nothing", UNCLEAR: "unclear",
};

function values(v: ComparisonValues | null | undefined) {
  if (!v || (!v.standard_size && !v.standard_uom && !v.standard_pack_size)) return "—";
  const unit = [v.standard_size, v.standard_uom].filter(Boolean).join(" ");
  return v.standard_pack_size ? `${unit} × ${v.standard_pack_size}` : unit;
}

/** The AI reasoning trial's answer for one row. Shadow only: shown, never applied. */
export function ReasoningSection({ jobId, row }: { jobId: string; row: number }) {
  const result = useQuery({ queryKey: ["reasoning-row", jobId, row], queryFn: () => getReasoningRow(jobId, row), enabled: Boolean(jobId) });
  const data = result.data?.row;
  if (!data) return null;
  const ai = data.ai;
  const [tierLabel, tierTone] = tierLabels[data.tier] || ["", "tone-all"];
  return <section className="detail-section reasoning-section">
    <div className="detail-section-heading"><h3>AI reasoning (trial)</h3><span>shown, not applied</span></div>
    {!ai && <p className="source-help">The reasoning call failed for this row{data.error ? `: ${data.error}` : ""}.</p>}
    {ai && <article className="reasoning-card">
      <div className="detail-badges">
        <span className={`status-badge ${tierTone}`}>{tierLabel}</span>
        <span className="result-badge">{verdictLabels[ai.verdict] || ai.verdict}</span>
        <span className="result-badge">{ai.confidence.toLowerCase()} confidence</span>
      </div>
      <p className="reasoning-unit"><strong>One unit is</strong> {ai.product_unit}</p>
      <p className="reasoning-explanation">{ai.explanation}</p>
      <div className="klm-table option-table reasoning-values">
        <div className="klm-table-head"><span>Reading</span><span>Unit size</span><span>Pack</span><span>Total</span></div>
        <div><strong>Engine today</strong><span>{[data.engine_values.standard_size, data.engine_values.standard_uom].filter(Boolean).join(" ") || "—"}</span><span>{data.engine_values.standard_pack_size || "—"}</span><span>{data.engine_values.total || "—"}</span></div>
        {data.engine_suggestion && <div><strong>Engine suggests</strong><span>{[data.engine_suggestion.standard_size, data.engine_suggestion.standard_uom].filter(Boolean).join(" ")}</span><span>{data.engine_suggestion.standard_pack_size || "—"}</span><span>{data.engine_suggestion.total || "—"}</span></div>}
        <div className={ai.values ? "has-proposal" : ""}><strong>AI would set</strong><span>{ai.values ? [ai.values.standard_size, ai.values.standard_uom].filter(Boolean).join(" ") : "cannot tell"}</span><span>{ai.values?.standard_pack_size || "—"}</span><span>{ai.values?.total || "—"}</span></div>
      </div>
      {ai.sources.length > 0 && <ul className="reasoning-sources">{ai.sources.map((s, i) => <li key={i}><strong>{s.source.replaceAll("_", " ").toLowerCase()}</strong> {meaningLabels[s.meaning] || s.meaning}{s.note ? ` · ${s.note}` : ""}</li>)}</ul>}
      {ai.evidence.length > 0 && <div className="evidence-readable"><strong>Words it relied on</strong>{ai.evidence.map((e, i) => <span key={i}>“{e.fragment}” in {e.field.replaceAll("_", " ")}</span>)}</div>}
      {(ai.needs_business_rule || ai.used_product_knowledge || data.guards.length > 0) && <div className="reasoning-flags">
        {ai.needs_business_rule && <small>Needs a business rule{ai.business_rule_note ? `: ${ai.business_rule_note}` : ""}</small>}
        {ai.used_product_knowledge && <small>Used product knowledge: {ai.used_product_knowledge}</small>}
        {data.guards.map(g => <small key={g} className="guard">Held by safety check: {g.replaceAll("_", " ").toLowerCase()}</small>)}
      </div>}
      {data.expected && <small className="reasoning-expected">Expected in the case file: {data.expected.verdict.replaceAll("_", " ").toLowerCase()}{data.expected.values ? ` ${values(data.expected.values)}` : ""} · {data.expected.score.replaceAll("_", " ").toLowerCase()}</small>}
    </article>}
  </section>;
}
