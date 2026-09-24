import { ReactNode, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AccuracyGroup, AccuracySetRow, getAccuracySet } from "../api/client";

const n = (v: number) => v.toLocaleString();
const pct = (a: number, b: number) => (b ? `${(100 * a / b).toFixed(1)}%` : "—");

export type Segment = { key: string; label: string; value: number; cls: string };
export type Way = { title: string; value: string; fraction: string; text: string; primary?: boolean; link?: string };
export type ExceptionGroup = { id: string; title: string; why: string; wrong?: boolean };
export type GroupSpec = {
  taskTitle: string; task: ReactNode; example: Array<{ label: string; value: string; rule?: boolean }>;
  segments: Segment[]; ways: Way[]; waysNote: string; exceptionsTitle: string; exceptions: ExceptionGroup[];
};

function reading(x: AccuracySetRow) {
  const v = x.suggestion || x.values;
  if (!v || !v.standard_size) return x.status === "UNRESOLVED" ? "left empty" : "kept as is";
  const unit = [v.standard_size, v.standard_uom].filter(Boolean).join(" ");
  return `${x.suggestion ? "suggests " : ""}${unit}${v.standard_pack_size ? ` × ${v.standard_pack_size}` : ""}`;
}

export function AccuracyGroupView({ jobId, g, spec }: { jobId: string; g: AccuracyGroup; spec: GroupSpec }) {
  const [openList, setOpenList] = useState<string | null>(null);
  const counts = Object.fromEntries(g.sets.map(s => [s.id, s.products]));
  const lists = useQueries({ queries: spec.exceptions.map(s => ({ queryKey: ["accuracy-set", jobId, s.id, 1], queryFn: () => getAccuracySet(jobId, s.id, 1), enabled: (counts[s.id] || 0) > 0 })) });
  const total = spec.segments.reduce((t, s) => t + s.value, 0) || 1;
  const exceptionTotal = spec.exceptions.reduce((t, e) => t + (counts[e.id] || 0), 0);
  return <>
    <section className="ledger-shell acc-card">
      <div className="ledger-meta"><strong>{spec.taskTitle}</strong><span>{n(g.products)} products</span></div>
      <div className="acc-task">
        {spec.task}
        <div className="acc-task-example">
          {spec.example.map((e, i) => <span key={i} className={e.rule ? "rule" : ""}><small>{e.label}</small><strong>{e.value}</strong></span>)}
        </div>
      </div>
      <div className="acc-job">
        <div className="acc-job-bar" aria-hidden="true">{spec.segments.map(s => <span key={s.key} className={s.cls} style={{ width: `${100 * s.value / total}%` }} />)}</div>
        <div className="acc-job-legend">{spec.segments.map(s => <span key={s.key}><i className={s.cls} />{s.label} <b>{n(s.value)}</b></span>)}</div>
      </div>
    </section>

    <section className="ledger-shell acc-card">
      <div className="ledger-meta"><strong>Three ways to read the accuracy</strong><span>same products, three questions</span></div>
      <div className="acc-ways">
        {spec.ways.map((w, i) => <article key={i} className={`way ${w.primary ? "primary" : ""}`}>
          <small>{i + 1} · {w.title}</small><strong>{w.value}</strong><span>{w.fraction}</span><p>{w.text}</p>
          {w.link && <Link className="status-badge tone-all" to={w.link}>See the test →</Link>}
        </article>)}
      </div>
      <p className="acc-note">{spec.waysNote}</p>
    </section>

    {exceptionTotal > 0 && <section className="ledger-shell acc-card">
      <div className="ledger-meta"><strong>{spec.exceptionsTitle.replace("{n}", n(exceptionTotal))}</strong><span>click a group to see the products</span></div>
      <div className="acc-exceptions">
        {spec.exceptions.map((s, i) => {
          const count = counts[s.id] || 0;
          if (!count) return null;
          const data = lists[i].data;
          const isOpen = openList === s.id;
          return <div key={s.id} className={`acc-exception ${isOpen ? "open" : ""} ${s.wrong ? "wrong" : ""}`}>
            <button onClick={() => setOpenList(isOpen ? null : s.id)}><b>{n(count)}</b><div><strong>{s.title}</strong><p>{s.why}</p></div><em>{isOpen ? "hide" : "show"}</em></button>
            {isOpen && <table className="acc-exception-table"><thead><tr><th>Product</th><th>Description</th><th>Older field</th><th>Excel now</th><th>The tool's reading</th></tr></thead><tbody>
              {(data?.rows || []).map((x: AccuracySetRow) => <tr key={x.row_number}>
                <td><strong>{x.item_no}</strong></td>
                <td>{x.product}{x.product_local ? <small>{x.product_local}</small> : null}</td>
                <td>{x.legacy || "—"}</td>
                <td>{x.values.standard_size ? `${x.values.standard_size} ${x.values.standard_uom || ""}${x.values.standard_pack_size ? ` × ${x.values.standard_pack_size}` : ""}` : "empty"}</td>
                <td>{reading(x)}<small>{x.witness}</small></td>
              </tr>)}
              {data && data.total > data.rows.length && <tr><td colSpan={5} className="muted">Showing the first {data.rows.length} of {n(data.total)}.</td></tr>}
            </tbody></table>}
          </div>;
        })}
      </div>
    </section>}
  </>;
}

const ROUTE_WORDS: Record<string, string> = {
  "Checked existing values": "checked existing values",
  "Converted from the old size": "converted from the older size field",
  "Read from the description": "read from the description",
  "Half-filled row": "completed a half-filled row",
  "Values could not be used": "found values that cannot be used",
};

function routeSentence(g: AccuracyGroup) {
  if (!g.routes.length) return null;
  return <p className="acc-lead">How they got here: {g.routes.map((r, i) => <span key={r.route}>{i ? (i === g.routes.length - 1 ? " and " : ", ") : ""}<b>{n(r.products)}</b> {ROUTE_WORDS[r.route] || r.route.toLowerCase()}</span>)}.</p>;
}

export function specFor(g: AccuracyGroup): GroupSpec {
  const c = Object.fromEntries(g.sets.map(s => [s.id, s.products]));
  const sum = (ids: string[]) => ids.reduce((t, id) => t + (c[id] || 0), 0);
  if (g.group === "A") {
    const stated = g.confirmed + g.wrong;
    return {
      taskTitle: "Group A · No change",
      task: <>
        <p className="acc-lead">For these {n(g.products)} products the tool wrote nothing into columns K, L and M. The values were already there, for example <b>70 GM × 5</b>, and they held up when the tool compared them with the older size field in I and J and with the product's own descriptions.</p>
        {routeSentence(g)}
        <p className="acc-lead">The question for this group: <b>was keeping the values right?</b></p>
      </>,
      example: [{ label: "Column I · J", value: "350 GM" }, { label: "Column K · L · M", value: "70 GM × 5" }, { label: "Check", value: "70 × 5 = 350, the whole pack: kept", rule: true }],
      segments: [{ key: "own", label: "Kept, the description agrees", value: g.confirmed, cls: "j-done" }, { key: "rec", label: "Kept, another record agrees", value: g.consistent, cls: "j-ask" }, { key: "none", label: "Kept, nothing to check against", value: g.unverified, cls: "j-blank" }, { key: "wrong", label: "Kept against the description", value: g.wrong, cls: "j-wrong" }],
      ways: [
        { title: "Was keeping right, where it can be checked?", value: pct(g.right, g.scored), fraction: `${n(g.right)} of ${n(g.scored)} checked · ${n(g.unverified)} had nothing to check against`, primary: true, text: `${n(g.confirmed)} are confirmed by their own description and ${n(g.consistent)} agree with the older size field. ${g.wrong ? `${n(g.wrong)} were kept although the description states a different size; those count against the tool.` : "None was kept against its description."}` },
        { title: "Strictest: only the product's own words count as proof", value: pct(g.confirmed, stated), fraction: `${n(g.confirmed)} of ${n(stated)} whose description states a size`, text: `The older field is usually the same entry copied across, so it proves consistency rather than correctness. Only ${n(stated)} products state a size in their own words.` },
        { title: "Counting the unchecked as unproven", value: pct(g.right, g.products), fraction: `${n(g.right)} of ${n(g.products)}`, text: `For ${n(g.unverified)} products the file holds nothing to compare with: no usable older field and no size in the text. This reading leaves them unproven rather than out.` },
      ],
      waysNote: "The first number answers the group's question on every product that can be checked. The second accepts only the product's own words. The third counts every product that cannot be checked as unproven.",
      exceptionsTitle: "The {n} products worth a look",
      exceptions: [
        { id: "a_text_disputes", title: "Kept, but the description states a different size", why: "The product's own words give a different weight or volume than the value kept. By the agreed rule the description wins, so these count against the tool.", wrong: true },
        { id: "a_unverified", title: "Kept, nothing to check it against", why: "No usable older field and no quantity in the description. The value is kept as entered; nothing in the file can confirm or deny it." },
      ],
    };
  }
  if (g.group === "B") {
    const unchallenged = g.products - g.wrong;
    return {
      taskTitle: "Group B · Changed by the tool",
      task: <>
        <p className="acc-lead">For these {n(g.products)} products the tool wrote into K, L or M itself. It converted the older size in I and J with the agreed table, for example <b>1 KG</b> to <b>1000 GM</b>. Or it read a size written in the description, completed the missing values of a half-filled row, or fixed a unit's spelling.</p>
        {routeSentence(g)}
        <p className="acc-lead">The question for this group: <b>was the change right?</b></p>
      </>,
      example: [{ label: "Column I · J", value: "1 KG" }, { label: "Column K · L", value: "1000 GM" }, { label: "Rule", value: "1 KG = 1000 GM, whole number", rule: true }],
      segments: [{ key: "own", label: "The description states the new value", value: g.confirmed, cls: "j-done" }, { key: "rec", label: "Another record agrees", value: g.consistent, cls: "j-ask" }, { key: "none", label: "Correct by the table, no second source", value: g.unverified, cls: "j-blank" }, { key: "wrong", label: "The description states something else", value: g.wrong, cls: "j-wrong" }],
      ways: [
        { title: "Was any change contradicted?", value: pct(unchallenged, g.products), fraction: `${n(unchallenged)} of ${n(g.products)} changes`, primary: true, text: `Every change comes from the agreed table, from words written in the description, or from what the row already held. ${g.wrong ? `${n(g.wrong)} are contradicted by the product's own description and count against the tool.` : "None is contradicted by the product's own description."}` },
        { title: "Can a second source in the file confirm the change?", value: pct(g.right, g.scored), fraction: `${n(g.right)} of ${n(g.scored)} that could be checked · ${n(g.unverified)} left out`, text: `${n(g.confirmed)} have the new value written in their own description and ${n(g.consistent)} agree with another record. For ${n(g.unverified)} the older field is the only information the file holds.` },
        { title: "Strictest: only changes with a second source count as proven", value: pct(g.right, g.products), fraction: `${n(g.right)} of ${n(g.products)}`, text: `The ${n(g.unverified)} changes with no second source are correct by the table, but nothing in the file traces them back, so this reading leaves them unproven.` },
      ],
      waysNote: `The first number asks whether anything in the file contradicts a change. The second asks whether something confirms it. The third is the second again, with the unconfirmed counted as unproven rather than left out.`,
      exceptionsTitle: "The {n} changes worth a look",
      exceptions: [
        { id: "b_text_disagrees", title: "Changed, but the description states a different size", why: "The value came from the older field, but the product's own words give another size. By the agreed rule the description wins, so these count against the tool.", wrong: true },
        { id: "b_read_wrong", title: "Read a value the text does not support", why: "The value read does not match what the description states. These count against the tool.", wrong: true },
        { id: "b_read_unverified", title: "Read a value, not found again on a second reading", why: "A value was read from the description, but the rule-based second reading could not find it in the text." },
        { id: "b_unverified", title: "Converted by the table, nothing to check it against", why: "The arithmetic is exact, but no description states a size and the category cannot tell a right value from a wrong one." },
      ],
    };
  }
  const disagree = sum(["c_flag_conflict", "c_flag_silent", "c_flag_split", "c_flag_text_supports", "c_flag_ounce", "c_flag_pack", "c_flag_conversion", "c_other"]);
  const nothing = sum(["c_nothing_written", "c_blank_unit", "c_gap_review", "c_unusable"]);
  const against = g.alarms + g.wrong;
  return {
    taskTitle: "Group C · Raised for a person",
    task: <>
      <p className="acc-lead">For these {n(g.products)} products the tool wrote nothing and handed the row to a person. Either the sources disagree, a value is only suggested, nothing is written anywhere, or a value in Excel cannot be used. Every discrepancy lands here.</p>
      {routeSentence(g)}
      <p className="acc-lead">The question for this group: <b>was raising it right?</b> A raise is right when the data bears it out. It is wrong when the text shows Excel was right, or when a size is written that the tool did not use.</p>
    </>,
    example: [{ label: "Column K · L · M", value: "500 GM × 1" }, { label: "Description", value: "OIL 900G" }, { label: "Raised", value: "two sources, two sizes: a person decides", rule: true }],
    segments: [{ key: "disagree", label: "Sources disagree", value: disagree, cls: "j-ask" }, { key: "nothing", label: "Nothing to go on", value: nothing, cls: "j-blank" }, { key: "against", label: "Raised, not needed or missed", value: against, cls: "j-wrong" }],
    ways: [
      { title: "Was raising it right?", value: pct(g.right, g.scored), fraction: `${n(g.right)} of ${n(g.scored)} raised`, primary: true, text: `Every raised product is judged. ${against ? `${n(g.alarms)} were not needed and ${n(g.wrong)} left a written size unused; those count against the tool.` : "None was raised without need, and none left a written size unused."}` },
      { title: "Raised because sources disagree", value: n(disagree), fraction: `of ${n(g.products)} raised`, text: "Excel, the older field and the description give different answers, or a count could mean the pack or its contents. The tool never picks a side on its own." },
      { title: "Raised because there is nothing to go on", value: n(nothing), fraction: `of ${n(g.products)} raised`, text: "No size is written in any of the six description fields, the older unit is in no table, a missing value is written nowhere, or a value in Excel cannot be used. Leaving it empty is the right answer." },
    ],
    waysNote: "Group C is judged on its own data: whether each raise is borne out by what the file contains. Nothing here is compared with a test.",
    exceptionsTitle: "The {n} raised products, by reason",
    exceptions: [
      { id: "c_alarm", title: "Raised, but the text shows Excel was right", why: "A second reading quoted words from the description that state Excel's value. These reviews were not needed and count against the tool.", wrong: true },
      { id: "c_missed", title: "Left blank, but a size is written", why: "A quantity is stated in the description that the reader did not use. These count against the tool.", wrong: true },
      { id: "c_flag_conflict", title: "The description disagrees with Excel", why: "The product's own words state a different size or count, or the English and Chinese text disagree. The tool never picks a side on its own." },
      { id: "c_flag_silent", title: "The older field and Excel disagree, nothing readable settles it", why: "Two records give different values and nothing in the product's words settles it. Only a person with the product can decide." },
      { id: "c_flag_split", title: "Same total, different split", why: "The older size times a count in the description equals Excel's total. One pack or several pieces is a business choice." },
      { id: "c_flag_text_supports", title: "The older field differs, the description supports Excel", why: "The description states what Excel has; the review is asked only because the older field disagrees. The answer is most likely Excel." },
      { id: "c_flag_ounce", title: "The ounce could mean weight or volume", why: "An ounce of a solid is 28 grams, of a liquid 30 millilitres, and the category holds both." },
      { id: "c_flag_pack", title: "A pack count needs confirming", why: "A count such as 12PCS can be the pack sold or what is inside it. A person confirms it before it is used." },
      { id: "c_flag_conversion", title: "The converted value needs a person", why: "The older field was converted, but the description or the pack disagrees with it." },
      { id: "c_nothing_written", title: "Nothing written to read", why: "No description states a size, and a rule-based second reading of the same six fields finds none either." },
      { id: "c_blank_unit", title: "The older unit is in no table", why: "A unit such as ST has no agreed conversion. Blank is the right answer until one is agreed." },
      { id: "c_gap_review", title: "Half-filled row, a missing value was not found", why: "What could be found was filled; the rest was only suggested because a second source disagrees, or it is written nowhere." },
      { id: "c_unusable", title: "A value in Excel cannot be used", why: "Text where a number should be, or a unit that is in no table." },
      { id: "c_other", title: "Raised for another checked reason", why: "A check found a reason for a person to look; the comment on the row names it." },
    ],
  };
}
