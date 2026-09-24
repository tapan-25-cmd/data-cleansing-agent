import { ReactNode, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AccuracyGroup, AccuracySetRow, getAccuracySet, ReadingTestAnchor } from "../api/client";

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

export function specFor(g: AccuracyGroup, anchor: ReadingTestAnchor, jobId: string): GroupSpec {
  const c = Object.fromEntries(g.sets.map(s => [s.id, s.products]));
  if (g.group === "B") {
    const blank = c.b_blank_unit || 0, asked = g.flags - blank, converted = g.products - g.flags - g.wrong;
    const done = converted + asked + blank, strict = g.confirmed + g.consistent + asked + blank;
    return {
      taskTitle: "Group B · What the tool was asked to do",
      task: <>
        <p className="acc-lead">In the workbook, columns I and J hold the size and unit as they were recorded in the older system, for example <b>1</b> and <b>KG</b>. Columns K, L and M are the standardised size, unit and pack size, and for these {n(g.products)} products they were empty.</p>
        <p className="acc-lead">The task: take the value in I and J and write it into K and L in the standard units the business uses, <b>GM</b> for weight, <b>ML</b> for volume and <b>EA</b> for pieces, using the agreed conversion table and rounding to a whole number. So 1 KG becomes 1000 GM, 12 OZ becomes 340 GM, 2 LT becomes 2000 ML, and 6 PC becomes 6 EA. When the older unit is not in the table, or the conversion is not safe, the tool stops and asks instead of guessing.</p>
      </>,
      example: [{ label: "Column I · J", value: "1 KG" }, { label: "Column K · L", value: "1000 GM" }, { label: "Rule", value: "1 KG = 1000 GM, whole number", rule: true }],
      segments: [{ key: "done", label: "Converted by the table", value: converted, cls: "j-done" }, { key: "ask", label: "Stopped and asked a person", value: asked, cls: "j-ask" }, { key: "blank", label: "Left blank on purpose", value: blank, cls: "j-blank" }, { key: "wrong", label: "Converted wrongly", value: g.wrong, cls: "j-wrong" }],
      ways: [
        { title: "Did the tool do its job on every product?", value: pct(done, g.products), fraction: `${n(done)} of ${n(g.products)}`, primary: true, text: "Every product was either converted by the table, handed to a person with a reason, or left blank with a reason. None was converted wrongly. This is the number for the job the tool was given." },
        { title: "Can a second source in the file confirm the value?", value: pct(g.right, g.scored), fraction: `${n(g.right)} of ${n(g.scored)} that could be checked · ${n(g.unverified)} left out`, text: `${n(g.confirmed)} products have the same size written in their own description and ${n(g.consistent)} agree with another record. For ${n(g.unverified)} products the older field is the only information the file holds, so nothing can confirm or deny them.` },
        { title: "Strictest reading: only products with a second source count as proven", value: pct(strict, g.products), fraction: `${n(strict)} of ${n(g.products)}`, text: `For ${n(g.unverified)} products the older size field is the only place in the file where a size exists: the descriptions carry no size and no count. Their conversion is correct by the table, but there is no second source to trace it back to, so this reading leaves them unproven.` },
      ],
      waysNote: `Which number to use depends on the question. "Did the tool convert the older field correctly?" is the first. "Has something else in the file confirmed the older field?" is the second. The third is the second again, with the products that have no second source counted as unproven rather than left out.`,
      exceptionsTitle: "The {n} products the tool did not decide alone",
      exceptions: [
        { id: "b_flag_ounce", title: "The ounce could mean weight or volume", why: "An ounce of a solid is 28 grams, an ounce of a liquid is 30 millilitres. These products sit in categories that hold both, and the text does not say which, so the tool shows its weight reading and asks a person to confirm." },
        { id: "b_flag_pack", title: "A pack count was read from the text and needs confirming", why: "Vouchers and coupons. A count such as 12 can mean twelve vouchers sold together or one voucher that gives twelve boxes. A person confirms it before it is used." },
        { id: "b_flag_text", title: "The description says a different size than the older field", why: "The older field says 220 GM, the product's own words say 255G. Two sources disagree, so the tool does not overwrite one with the other on its own." },
        { id: "b_blank_unit", title: "Left blank: the older field uses a unit nobody has defined", why: "The unit ST is in no conversion table. Rather than guess what it means, the tool leaves the size empty and says why." },
        { id: "b_text_disagrees", title: "Converted, but the description states a different size", why: "The table converted the older field, but the product's own words give another size. By the agreed rule the description wins, so these count against the tool.", wrong: true },
      ],
    };
  }
  if (g.group === "A") {
    const kept = g.right, done = g.right + g.flags, stated = g.confirmed + g.wrong;
    return {
      taskTitle: "Group A · What the tool was asked to do",
      task: <>
        <p className="acc-lead">For these {n(g.products)} products columns K, L and M were already filled in: a size, a unit and a pack size, for example <b>70 GM × 5</b>. Columns I and J hold the older size field, for example <b>350 GM</b>, and the six description fields hold the product's own words.</p>
        <p className="acc-lead">The task was not to change these values but to check them: compare K, L and M with the older field and with the descriptions, keep the values that hold up, and hand over the ones that do not, each with a reason a person can act on. A value is changed only after a person agrees.</p>
      </>,
      example: [{ label: "Column I · J", value: "350 GM" }, { label: "Column K · L · M", value: "70 GM × 5" }, { label: "Check", value: "70 × 5 = 350, the whole pack: kept", rule: true }],
      segments: [{ key: "kept", label: "Kept, a record or the text agrees", value: kept, cls: "j-done" }, { key: "ask", label: "Handed to a person with a reason", value: g.flags, cls: "j-ask" }, { key: "none", label: "Kept, nothing to check against", value: g.unverified, cls: "j-blank" }, { key: "wrong", label: "Kept against the description", value: g.wrong, cls: "j-wrong" }],
      ways: [
        { title: "Did the tool do its job on every product?", value: pct(done, done + g.wrong), fraction: `${n(done)} of ${n(done + g.wrong)} · ${n(g.unverified)} had nothing to check against`, primary: true, text: `Every product was either kept because the older field or the description agrees, or handed to a person with a reason. ${n(g.wrong)} were kept although the description states a different size; those count against the tool.` },
        { title: "Can a second source in the file confirm the value?", value: pct(g.right, g.scored), fraction: `${n(g.right)} of ${n(g.scored)} that could be checked · ${n(g.unverified)} left out`, text: `${n(g.confirmed)} products are confirmed by their own description. ${n(g.consistent)} agree with the older field, which is usually the same entry copied across, so that proves the two records are consistent rather than that both are right.` },
        { title: "Strictest reading: only the product's own words count as proof", value: pct(g.confirmed, stated), fraction: `${n(g.confirmed)} of ${n(stated)} whose description states a size`, text: `Only ${n(stated)} products have a size written in their description. For the other ${n(g.products - stated)} the older field is the only other record, so nothing fully independent exists to trace them back to.` },
      ],
      waysNote: `"Did the tool check every product and act correctly?" is the first number. "Does another record agree with the value?" is the second. The third asks the hardest question, whether the product's own words confirm it, and most products simply do not carry a size in their description.`,
      exceptionsTitle: "The {n} products the tool did not decide alone",
      exceptions: [
        { id: "a_flag_silent", title: "The older field and Excel disagree, and the description says nothing", why: "Two records give different values and nothing readable in the product's words settles it. Only a person with the product can decide, so the tool asks." },
        { id: "a_flag_conflict", title: "The description disagrees with Excel", why: "The product's own words state a different count or size, or the English and Chinese text disagree with each other. The tool never picks a side on its own." },
        { id: "a_flag_split", title: "Same total, different split", why: "The older field's size times a count in the description equals Excel's total, for example 55 GM × 10 against 550 GM × 1. Whether to store it as one pack or ten is a business choice, so a person decides." },
        { id: "a_flag_text_supports", title: "The older field differs, but the description supports Excel", why: "The description states what Excel already has. The review is asked only because the older field disagrees; the answer is most likely Excel." },
        { id: "a_alarm", title: "Handed over, but the text shows Excel was right", why: "A second reading quoted words from the description that state Excel's value. These reviews were not needed and are the tool's cost, not the data's." },
        { id: "a_text_disputes", title: "Kept, but the description states a different size", why: "The product's own words give a different weight or volume than the value kept. By the agreed rule the description wins, so these count against the tool.", wrong: true },
      ],
    };
  }
  const read = c.c_read || 0, blankOk = c.c_nothing_right || 0, reRead = blankOk + g.wrong;
  return {
    taskTitle: "Group C · What the tool was asked to do",
    task: <>
      <p className="acc-lead">For these {n(g.products)} products every size column was empty: nothing in I and J, nothing in K, L and M. The only information is the six description fields, in English and Chinese.</p>
      <p className="acc-lead">The task: read those words and, if a size is written there, quote it and write it into K and L in the standard units, for example <b>ORGANIC JUICE 500ML</b> becomes <b>500 ML</b>. If no size is written, leave the columns empty rather than guess. A number that describes a container, a grade or a year is never a size.</p>
    </>,
    example: [{ label: "Description", value: "GREEN TEA / 綠茶" }, { label: "Column K · L", value: "left empty" }, { label: "Rule", value: "nothing written, nothing invented", rule: true }],
    segments: [{ key: "read", label: "Read a size written in the text", value: read, cls: "j-done" }, { key: "blank", label: "Correctly left empty, nothing is written", value: blankOk, cls: "j-blank" }, { key: "ask", label: "Handed to a person", value: g.flags, cls: "j-ask" }, { key: "wrong", label: "Read wrongly or missed", value: g.wrong, cls: "j-wrong" }],
    ways: [
      { title: "Did the tool do its job on every product?", value: pct(read + blankOk + g.flags, g.products), fraction: `${n(read + blankOk + g.flags)} of ${n(g.products)}`, primary: true, text: `${n(blankOk)} products have no size written in any of their six description fields, so leaving them empty was the correct answer. ${n(g.flags)} were handed to a person. ${g.wrong ? `${n(g.wrong)} were read wrongly or missed.` : "None was read wrongly or missed."}` },
      { title: "Does a second reading of the same text agree?", value: pct(blankOk + read, reRead + read), fraction: `${n(blankOk + read)} of ${n(reRead + read)} re-read`, text: `Every Group C description was read a second time by a separate, rule-based reader that knows the same units and count words. It found no size in ${n(blankOk)} of them, the same result the tool reached${read ? `, and the same size in ${n(read)} that the tool read` : ""}.` },
      { title: "Sizes it actually read", value: read ? pct(read, read + g.wrong) : "none to read", fraction: read ? `${n(read)} of ${n(read + g.wrong)}` : "no size was written in any of these descriptions", text: read ? "Of the sizes the tool read from the text, this share is stated word for word in the description." : "On this workbook nothing was written, so there was nothing to read and nothing to get wrong. The tool's job here was to recognise that, and it did." },
    ],
    waysNote: `Group C is judged on what the descriptions contain. When they contain no size, the correct result is an empty cell, and that is what the tool produced.`,
    exceptionsTitle: "The {n} products the tool did not decide alone",
    exceptions: [
      { id: "c_flag_pack", title: "A pack count was read and needs confirming", why: "The text states a count, such as a four-pack, but no size. A person confirms whether the count is the pack sold or what is inside it before it is used." },
      { id: "c_missed", title: "Left empty, but a size is written", why: "A quantity is stated in the description that the reader did not use. These count against the tool.", wrong: true },
      { id: "c_wrong_read", title: "Read a value the text does not support", why: "The value read does not match what the description states. These count against the tool.", wrong: true },
    ],
  };
}
