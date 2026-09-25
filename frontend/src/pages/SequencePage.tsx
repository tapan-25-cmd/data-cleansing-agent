import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { marked } from "marked";
import { DocName, getDocument } from "../api/client";
import { JobTabs } from "./JobTabs";

type Part = { kind: "text"; text: string } | { kind: "diagram"; code: string };
type Section = { id: string; title: string; parts: Part[] };

// The document is our own file served by the API; it is split into its "## " sections and
// each Mermaid block is drawn as a diagram.
function sections(markdown: string): { title: string; intro: Part[]; list: Section[] } {
  const [head, ...rest] = markdown.split(/^## /m);
  const title = (head.match(/^# (.*)$/m)?.[1] || "").trim();
  const split = (text: string): Part[] => text.split(/```mermaid\n([\s\S]*?)```/).map((chunk, i) =>
    i % 2 ? { kind: "diagram" as const, code: chunk } : { kind: "text" as const, text: chunk }).filter(p => p.kind === "diagram" || p.text.trim());
  const list = rest.map((body, i) => {
    const [first, ...lines] = body.split("\n");
    return { id: `s${i}`, title: first.trim(), parts: split(lines.join("\n")) };
  });
  return { title, intro: split(head.replace(/^# .*$/m, "")), list };
}

let mermaidReady: Promise<typeof import("mermaid")["default"]> | null = null;
function loadMermaid() {
  mermaidReady ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false, securityLevel: "strict", theme: "base",
      themeVariables: {
        fontFamily: "DM Sans, sans-serif", fontSize: "13px",
        primaryColor: "#f3faf4", primaryBorderColor: "#6e997a", primaryTextColor: "#173f35",
        lineColor: "#6f8f86", secondaryColor: "#f6f8f7", tertiaryColor: "#fbfcfb",
        actorBkg: "#e8f1ed", actorTextColor: "#173f35", actorBorder: "#6e997a", actorLineColor: "#b9c9c4",
        signalColor: "#35524a", signalTextColor: "#1f3a33", labelBoxBkgColor: "#eef4f1", labelBoxBorderColor: "#c9d8d2",
        labelTextColor: "#173f35", loopTextColor: "#35524a", noteBkgColor: "#fff7e0", noteBorderColor: "#ecd9a0", noteTextColor: "#5b4a17",
        activationBkgColor: "#e4f0fa", sequenceNumberColor: "#ffffff",
      },
      sequence: { useMaxWidth: false, mirrorActors: false, messageMargin: 32, boxMargin: 8, noteMargin: 8, wrap: false },
    });
    return mermaid;
  });
  return mermaidReady;
}

let counter = 0;
function Diagram({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [actual, setActual] = useState(false);
  useEffect(() => {
    let live = true;
    loadMermaid()
      .then(mermaid => mermaid.render(`seq-diagram-${++counter}`, code))
      .then(result => { if (live) setSvg(result.svg); })
      .catch(err => { if (live) setError(String(err?.message || err)); });
    return () => { live = false; };
  }, [code]);
  if (error) return <div className="alert error">This diagram could not be drawn: {error}</div>;
  return <div className={`seq-diagram ${actual ? "actual" : "fit"}`}>
    {svg && <button className="seq-zoom" onClick={() => setActual(v => !v)}>{actual ? "Fit to width" : "Actual size"}</button>}
    {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="muted">Drawing…</span>}
  </div>;
}

function Parts({ parts }: { parts: Part[] }) {
  return <>{parts.map((part, i) => part.kind === "diagram"
    ? <Diagram key={i} code={part.code} />
    : <div key={i} className="seq-text" dangerouslySetInnerHTML={{ __html: marked.parse(part.text, { async: false }) as string }} />)}</>;
}

// A document from docs/ shown one section at a time. The Sequence and Accuracy rules tabs
// are the same page over different files.
type DocSpec = { name: DocName; eyebrow: string; tab: string; blurb: string; file: string; layout?: "sections" | "document" };
export const SequencePage = () => <DocPage name="sequence" eyebrow="Sequence" tab="sequence" file="pipeline-sequence.md" blurb="Every call, database write and AI call, from upload to download. Pick a step to see its diagram." />;
export const AccuracyRulesPage = () => <DocPage name="accuracy-rules" eyebrow="Accuracy rules" tab="accuracy-rules" file="accuracy-rules.md" layout="document" blurb="One page to share: the rule per group, what it counts as, the count, and an item number to look up." />;

function DocPage({ name, eyebrow, tab, blurb, file, layout = "sections" }: DocSpec) {
  const { jobId = "" } = useParams();
  const doc = useQuery({ queryKey: ["document", name], queryFn: () => getDocument(name) });
  const parsed = useMemo(() => (doc.data ? sections(doc.data.markdown) : null), [doc.data]);
  // ?section=5 opens "5. Processing" directly, so a step can be linked.
  const [params, setParams] = useSearchParams();
  const active = `s${Math.max(0, Number(params.get("section") || 1) - 1)}`;
  const top = useRef<HTMLDivElement>(null);
  const current = parsed?.list.find(s => s.id === active) || parsed?.list[0];
  const download = () => {
    if (!doc.data) return;
    const url = URL.createObjectURL(new Blob([doc.data.markdown], { type: "text/markdown" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: file });
    a.click(); URL.revokeObjectURL(url);
  };

  return <div className="results-page acc-page" ref={top}>
    <header className="results-header">
      <div><p className="eyebrow">{eyebrow}</p><h1>{parsed?.title || eyebrow}</h1><p>{blurb}</p></div>
      <div className="seq-actions">
        {doc.data && layout === "document" && <button className="secondary" onClick={() => window.print()}>Print / PDF</button>}
        {doc.data && <button className="secondary" onClick={download}>Download .md</button>}
        <Link className="secondary" to="/">← Back to conversation</Link>
      </div>
    </header>
    {jobId && <JobTabs jobId={jobId} active={tab} />}
    {doc.isLoading && <section className="compare-loading"><span className="spinner" /><div><strong>Loading the document</strong></div></section>}
    {doc.isError && <div className="alert error">{doc.error.message}</div>}
    {parsed && layout === "document" && <article className="ledger-shell acc-card seq-card seq-document">
      <div className="seq-body">
        <Parts parts={parsed.intro} />
        {parsed.list.map(s => <section key={s.id}><h2>{s.title}</h2><Parts parts={s.parts} /></section>)}
      </div>
    </article>}
    {parsed && current && layout === "sections" && <>
      <nav className="acc-subnav seq-nav" aria-label="Sections">
        {parsed.list.map(s => <button key={s.id} className={s.id === current.id ? "active" : ""} onClick={() => { setParams({ section: String(Number(s.id.slice(1)) + 1) }, { replace: true }); top.current?.scrollIntoView({ behavior: "smooth" }); }}>{s.title}</button>)}
      </nav>
      {current.id === parsed.list[0].id && <section className="ledger-shell acc-card seq-card"><div className="ledger-meta"><strong>At a glance</strong><span>{doc.data?.path}</span></div><div className="seq-body"><Parts parts={parsed.intro} /></div></section>}
      <section className="ledger-shell acc-card seq-card">
        <div className="ledger-meta"><strong>{current.title}</strong><span>{current.parts.filter(p => p.kind === "diagram").length || "no"} diagram{current.parts.filter(p => p.kind === "diagram").length === 1 ? "" : "s"}</span></div>
        <div className="seq-body"><Parts key={current.id} parts={current.parts} /></div>
      </section>
    </>}
  </div>;
}
