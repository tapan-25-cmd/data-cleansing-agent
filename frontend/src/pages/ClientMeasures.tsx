import { ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccuracySetRow, ClientMeasuresReport, getAccuracySet } from "../api/client";

// The client's three Release 1 measures, laid out the way their email sets them out
// (population, test, current result, target) with their own wording, and our numbers
// for this run. Every count opens the products behind it.

const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);

function values(x: AccuracySetRow) {
  const v = x.suggestion || x.values;
  if (!v || !v.standard_size) return "empty";
  return `${[v.standard_size, v.standard_uom].filter(Boolean).join(" ")}${v.standard_pack_size ? ` × ${v.standard_pack_size}` : ""}`;
}

function Products({ jobId, id }: { jobId: string; id: string }) {
  const rows = useQuery({ queryKey: ["accuracy-set", jobId, id, 1], queryFn: () => getAccuracySet(jobId, id, 1) });
  if (rows.isLoading) return <p className="muted cm-loading">Loading products…</p>;
  if (rows.isError) return <p className="alert error">{rows.error.message}</p>;
  const data = rows.data!;
  return <table className="acc-exception-table"><thead><tr><th>Product</th><th>Description</th><th>Older field</th><th>Excel now</th><th>Why</th></tr></thead><tbody>
    {data.rows.map(x => <tr key={x.row_number}>
      <td><strong>{x.item_no}</strong></td>
      <td>{x.product}{x.product_local ? <small>{x.product_local}</small> : null}</td>
      <td>{x.legacy || "—"}</td>
      <td>{values(x)}<small>{x.status_label}</small></td>
      <td>{x.witness || "—"}</td>
    </tr>)}
    {data.total > data.rows.length && <tr><td colSpan={5} className="muted">Showing the first {data.rows.length} of {n(data.total)}.</td></tr>}
  </tbody></table>;
}

/** One line of a result: a count and what it counts, opening the products behind it. */
export function ResultLine({ jobId, id, count, label, tone }: { jobId: string; id?: string; count: number; label: ReactNode; tone?: "good" | "wrong" | "muted" }) {
  const [open, setOpen] = useState(false);
  const clickable = Boolean(id) && count > 0;
  return <li className={`cm-line ${tone || ""} ${open ? "open" : ""}`}>
    <button disabled={!clickable} onClick={() => setOpen(v => !v)}>
      <b>{n(count)}</b><span>{label}</span>{clickable && <em>{open ? "hide" : "show"}</em>}
    </button>
    {open && id && <Products jobId={jobId} id={id} />}
  </li>;
}

function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="cm-quote"><small>In the email</small>{children}</blockquote>;
}

function Spec({ label, children }: { label: string; children: ReactNode }) {
  return <div className="cm-spec"><dt>{label}</dt><dd>{children}</dd></div>;
}

function Head({ title, where, value, sub }: { title: string; where: string; value: string; sub: string }) {
  return <div className="ledger-meta cm-head"><div><strong>{title}</strong><span>{where}</span></div><div className="cm-value"><b>{value}</b><small>{sub}</small></div></div>;
}

/** The three measures side by side, with the email's framing. */
export function MeasuresOverview({ m, onOpen }: { m: ClientMeasuresReport; onOpen: (group: "A" | "B" | "C") => void }) {
  const r = m.rule_accuracy, c = m.correctness, f = m.flag_precision;
  return <section className="ledger-shell acc-card">
    <div className="ledger-meta"><strong>How we measure accuracy</strong><span>the client's three measures, reported separately</span></div>
    <Quote>{m.intro}</Quote>
    <div className="cm-tiles">
      <button className="cm-tile" onClick={() => onOpen("B")}>
        <small>Measure {r.letter} · on Group B</small><strong>{r.name}</strong>
        <b>{pct(r.percent)}</b><span>{n(r.matched)} of {n(r.tested)} match the arithmetic conversion</span>
        <em>Target: 100% once the rounding and fluid-ounce rules are confirmed</em>
      </button>
      <button className="cm-tile waiting" onClick={() => onOpen("A")}>
        <small>Measure {c.letter} · on Groups A and B</small><strong>{c.name}</strong>
        <b>Waiting</b><span>for the Merchandising Team's cleansing in the Data Lake · {n(c.products)} rows to score</span>
        <em>Target: 95% on unit size and on unit of measure, each on its own</em>
      </button>
      <button className="cm-tile" onClick={() => onOpen("C")}>
        <small>Measure {f.letter} · on Group C</small><strong>{f.name}</strong>
        <b>{pct(f.percent)}</b><span>{n(f.justified)} of {n(f.products)} flags justified by the row's own fields</span>
        <em>Reported separately, not in the 95%</em>
      </button>
    </div>
    <p className="acc-note"><b>Before the model answer is ready.</b> {m.before_benchmark} The letters A, B and C above are the email's measures; our groups are named on each card.</p>
  </section>;
}

/** Group A: what "Already correct" establishes, and the correctness measure it waits for. */
export function ConsistencyCard({ jobId, m }: { jobId: string; m: ClientMeasuresReport }) {
  const a = m.consistency, c = m.correctness;
  const matches = a.exact + a.within_one + a.fluid;
  return <>
    <section className="ledger-shell acc-card">
      <Head title="What “Already correct” establishes" where="Group A · no change" value={n(matches)} sub={`of ${n(a.already_correct)} match the legacy size`} />
      <Quote>{m.eric}</Quote>
      <dl className="cm-specs">
        <Spec label="Rows">{n(a.products)} with nothing changed: {n(a.already_correct)} “Already correct” and {n(a.with_note)} “Correct with a note”.</Spec>
        <Spec label="Current result">
          <ul className="cm-lines">
            <ResultLine jobId={jobId} id="m_a_exact" count={a.exact} label="the existing value matches the legacy size exactly" />
            <ResultLine jobId={jobId} id="m_a_within_one" count={a.within_one} label="within one unit" />
            {a.fluid > 0 && <ResultLine jobId={jobId} id="m_a_fluid" count={a.fluid} label="match when the ounce is read as a US fluid ounce (depends on the fluid-ounce rule)" />}
            {a.other > 0 && <ResultLine jobId={jobId} id="m_a_other" count={a.other} label="do not match the legacy size" tone="wrong" />}
            <ResultLine jobId={jobId} id="m_a_identical" count={a.identical} tone="muted" label="the two fields are identical, the same entry in both places, so the agreement adds little on its own" />
          </ul>
        </Spec>
        <Spec label="Independent check">
          <ul className="cm-lines">
            <ResultLine jobId={jobId} id="a_text_confirms" count={a.confirmed_by_text} tone="good" label="are confirmed by the product's own description, the only witness independent of the entry" />
            <ResultLine jobId={jobId} id="a_text_disputes" count={a.kept_against_text} tone="wrong" label="were kept although the description states a different size" />
            <ResultLine jobId={jobId} id="a_unverified" count={a.nothing_to_compare} tone="muted" label="have nothing to compare with" />
          </ul>
        </Spec>
        <Spec label="Suggested label"><Quote>{a.relabel}</Quote></Spec>
      </dl>
      <Quote>{a.wording}</Quote>
    </section>
    <CorrectnessCard c={c} />
  </>;
}

export function CorrectnessCard({ c }: { c: ClientMeasuresReport["correctness"] }) {
  return <section className="ledger-shell acc-card">
    <Head title={`Measure ${c.letter} · ${c.name}`} where="Groups A and B · scored against the benchmark" value="Waiting" sub="for the benchmark" />
    <dl className="cm-specs">
      <Spec label="Benchmark">{c.benchmark}</Spec>
      <Spec label="Population"><span className="cm-words">{c.population}.</span>
        <ul className="cm-lines">{c.population_rows.map(r => <ResultLine key={r.label} jobId="" count={r.products} label={`“${r.label}”`} />)}</ul>
      </Spec>
      <Spec label="Scoring">{c.scoring}</Spec>
      <Spec label="Target">{c.target}</Spec>
      <Spec label="Status">Not scored yet: the Merchandising Team's cleansing has not been uploaded to the Data Lake. When it arrives, each of these {c.products.toLocaleString()} rows is compared field by field.</Spec>
    </dl>
  </section>;
}

/** Group B: rule accuracy. */
export function RuleAccuracyCard({ jobId, m }: { jobId: string; m: ClientMeasuresReport }) {
  const r = m.rule_accuracy;
  const byId = Object.fromEntries(r.rows.map(x => [x.id, x]));
  const line = (id: string, tone?: "good" | "wrong" | "muted") => byId[id] && (byId[id].products > 0 || id === "m_rule_mismatch")
    ? <ResultLine key={id} jobId={jobId} id={id} count={byId[id].products} label={byId[id].label} tone={byId[id].wrong ? (byId[id].products ? "wrong" : "good") : tone} /> : null;
  const packs = r.pack_filled.single_item + r.pack_filled.from_description;
  return <>
    <section className="ledger-shell acc-card">
      <Head title={`Measure ${r.letter} · ${r.name}`} where="Group B · changed by the tool" value={pct(r.percent)} sub={`${n(r.matched)} of ${n(r.tested)} match`} />
      <dl className="cm-specs">
        <Spec label="Population">The {n(r.products)} {r.population.replace(/^the /, "")}.</Spec>
        <Spec label="Test">{r.test[0].toUpperCase() + r.test.slice(1)}.</Spec>
        <Spec label="Current result">
          <ul className="cm-lines">
            {line("m_rule_exact")}{line("m_rule_round_same")}{line("m_rule_round_differ")}{line("m_rule_label")}{line("m_rule_fluid")}
            {line("m_rule_mismatch")}
            {line("m_rule_not_conversion", "muted")}{line("m_rule_pack_only", "muted")}
          </ul>
          {packs > 0 && <p className="cm-aside">The pack size was also filled on {n(packs)} of these ({n(r.pack_filled.single_item)} single items, {n(r.pack_filled.from_description)} from the description). Pack size is not part of this test; it is scored under correctness, against its own baseline.</p>}
        </Spec>
        <Spec label="Target">{r.target}</Spec>
        <Spec label="To confirm"><Quote>{r.open}</Quote><p className="cm-aside">On this run the two rounding rules differ on {n(r.rules_differ)} rows; those are the rows that change if truncation is chosen.</p></Spec>
      </dl>
    </section>
  </>;
}

/** Group C: flag precision. */
export function FlagPrecisionCard({ jobId, m }: { jobId: string; m: ClientMeasuresReport }) {
  const f = m.flag_precision;
  return <section className="ledger-shell acc-card">
    <Head title={`Measure ${f.letter} · ${f.name}`} where="Group C · raised for a person" value={pct(f.percent)} sub={`${n(f.justified)} of ${n(f.products)} justified`} />
    <dl className="cm-specs">
      <Spec label="Population">The {n(f.products)} {f.population.replace(/^the /, "")}: {n(f.needs_review)} “Needs your review”, {n(f.could_not_determine)} “Could not determine”{f.invalid ? `, ${n(f.invalid)} “Invalid values”` : ""}.</Spec>
      <Spec label="Test">{f.test[0].toUpperCase() + f.test.slice(1)}</Spec>
      <Spec label="Current result">
        <ul className="cm-lines">
          {f.reasons.filter(x => x.products > 0 || !x.justified).map(x => <ResultLine key={x.id} jobId={jobId} id={x.id} count={x.products} label={x.label} tone={x.justified ? undefined : (x.products ? "wrong" : "good")} />)}
        </ul>
      </Spec>
      <Spec label="Merchandising check">How many flagged rows the Merchandising answer resolves: waiting for the benchmark.</Spec>
      <Spec label="Reported">{f.reported}</Spec>
    </dl>
    <div className="cm-facts">
      <div><Quote>{f.catches}</Quote><p>{n(f.legacy_mismatch)} of the {n(f.needs_review)} rows needing review carry a legacy size or unit mismatch; {n(f.legacy_mismatch_with_proposal)} of those have a proposed value, and all are left for a person to decide.</p></div>
      <div><Quote>{f.comments}</Quote><p>{f.blank_comment ? `${n(f.blank_comment)} of the ${n(f.products)} have no comment.` : `None of the ${n(f.products)} is blank`}, and {n(f.with_proposal)} carry a proposed value.</p></div>
    </div>
  </section>;
}
