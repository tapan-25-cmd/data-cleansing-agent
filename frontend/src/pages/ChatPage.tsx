import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createExport, getItems, getJob, getPreview, getSummary, JobItem, sendChatMessage, startProcessing, uploadWorkbook } from "../api/client";

type Message = { id: number; role: "user" | "assistant"; text: string; upload?: boolean };
const starter = "Please do the unit measurement";
const activeStatuses = new Set(["UPLOADED", "VALIDATING", "PROFILING", "PROCESSING", "PROCESSING_RULES", "PROCESSING_DESCRIPTIONS", "CHECKING_DISCREPANCIES", "EXPORTING"]);

function display(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function ChatPage() {
  const [composer, setComposer] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "assistant", text: "Hello — I can cleanse and standardize unit-of-measure data in your workbook." },
  ]);
  const [jobId, setJobId] = useState(() => localStorage.getItem("uom-current-job") || "");
  const [panelOpen, setPanelOpen] = useState(false);
  const [group, setGroup] = useState("A");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const nextMessage = useRef(2);

  const append = (message: Omit<Message, "id">) => setMessages(current => [...current, { ...message, id: nextMessage.current++ }]);
  const chat = useMutation({ mutationFn: sendChatMessage, onSuccess: response => append({ role: "assistant", text: response.message, upload: response.action === "REQUEST_WORKBOOK" }), onError: err => setError(err.message) });
  const job = useQuery({
    queryKey: ["job", jobId], queryFn: () => getJob(jobId), enabled: Boolean(jobId),
    refetchInterval: query => activeStatuses.has(query.state.data?.status || "") ? 1200 : false,
  });
  const finished = job.data?.status === "READY_FOR_REVIEW" || job.data?.status === "EXPORTED";
  const summary = useQuery({ queryKey: ["summary", jobId], queryFn: () => getSummary(jobId), enabled: Boolean(jobId) && finished });
  const preview = useQuery({ queryKey: ["preview", jobId], queryFn: () => getPreview(jobId), enabled: Boolean(jobId) && finished });
  const review = useQuery({ queryKey: ["review-preview", jobId, group], queryFn: () => getItems(jobId, group, 1, 50), enabled: Boolean(jobId) && finished && panelOpen });
  const exporter = useMutation({ mutationFn: () => createExport(jobId), onSuccess: () => job.refetch(), onError: err => setError(err.message) });

  useEffect(() => {
    if (finished) setPanelOpen(true);
  }, [finished]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = composer.trim();
    if (!text || chat.isPending) return;
    append({ role: "user", text });
    setComposer("");
    setError("");
    chat.mutate(text);
  };

  const selectWorkbook = async (file?: File) => {
    if (!file) return;
    setError("");
    append({ role: "user", text: `Attached ${file.name}` });
    append({ role: "assistant", text: "Workbook received. I’m validating its structure and then applying deterministic rules and description inference." });
    try {
      const uploaded = await uploadWorkbook(file);
      localStorage.setItem("uom-current-job", uploaded.job_id);
      setJobId(uploaded.job_id);
      await startProcessing(uploaded.job_id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const stats = summary.data?.stats;
  const exporting = exporter.isPending || job.data?.status === "EXPORTING";
  const exported = job.data?.status === "EXPORTED";
  return <div className={`chat-layout ${panelOpen && finished ? "with-review" : ""}`}>
    <section className="chat-main">
      <header className="chat-header">
        <div><p className="eyebrow">UOM cleansing agent</p><h2>Data cleansing conversation</h2></div>
        {finished && <button className="secondary" onClick={() => setPanelOpen(value => !value)}>{panelOpen ? "Hide" : "View"} A/B/C results</button>}
      </header>
      <div className="conversation">
        {messages.map(message => <div className={`message ${message.role}`} key={message.id}>
          <div className="avatar">{message.role === "assistant" ? "DFI" : "You"}</div>
          <div className="bubble"><p>{message.text}</p>{message.upload && <button className="upload-action" onClick={() => fileInput.current?.click()}><span>＋</span> Upload Excel workbook</button>}</div>
        </div>)}
        {!jobId && messages.length === 1 && <button className="starter-card" onClick={() => setComposer(starter)}><span>↗</span><div><strong>Clean unit measurements</strong><small>{starter}</small></div></button>}
        {jobId && !finished && job.data?.status !== "FAILED" && <div className="process-card">
          <span className="spinner" /><div><strong>{display(job.data?.progress.stage).replaceAll("_", " ")}</strong><p>{job.data?.progress.processed || 0} of {job.data?.progress.total || "—"} rows processed</p></div>
          <div className="mini-progress"><span style={{ width: `${job.data?.progress.percent || 8}%` }} /></div>
        </div>}
        {job.data?.status === "FAILED" && <div className="alert error">{job.data.error || "Processing failed."}</div>}
        {finished && stats && <div className="result-card">
          <div className="result-heading"><div><p className="eyebrow">Processing complete</p><h2>Your workbook is ready</h2></div><button className="secondary" onClick={() => setPanelOpen(true)}>View A/B/C</button></div>
          <div className="stat-strip"><span><strong>{display(stats.department_rows)}</strong>Rows</span><span><strong>{display(stats.group_a)}</strong>A · Correct</span><span><strong>{display(stats.group_b)}</strong>B · Rule fixes</span><span><strong>{display(stats.group_c)}</strong>C · Inferred</span></div>
          <div className="preview-table"><table><thead><tr><th>Item</th><th>Group</th><th>Original</th><th>Proposed</th><th>Method</th></tr></thead><tbody>
            {preview.data?.items.map(item => <tr key={item.row_number}><td>{item.item_no}</td><td><b className={`group-pill group-${item.group.toLowerCase()}`}>{item.group}</b></td><td>{display(item.original.standard_size)} {display(item.original.standard_uom)}</td><td>{display(item.field_proposals.standard_size)} {display(item.field_proposals.standard_uom)}</td><td>{display(item.method)}</td></tr>)}
          </tbody></table></div>
          {exported ? <a className="primary download" href={`/api/jobs/${jobId}/download`}>Download cleansed workbook</a> : <button className="primary" disabled={exporting} onClick={() => exporter.mutate()}>{exporting ? `${display(job.data?.progress.stage).replaceAll("_", " ")}…` : "Generate and download workbook"}</button>}
          <small className="policy-note">Review is optional. Pending A/B/C items do not block export.</small>
        </div>}
        {error && <div className="alert error">{error}</div>}
      </div>
      <form className="composer" onSubmit={submit}>
        <input ref={fileInput} type="file" accept=".xlsx" hidden onChange={event => selectWorkbook(event.target.files?.[0])} />
        <button type="button" className="attach" aria-label="Upload Excel workbook" onClick={() => fileInput.current?.click()}>＋</button>
        <input value={composer} onChange={event => setComposer(event.target.value)} placeholder="Ask the agent to cleanse unit measurements…" />
        <button className="send" disabled={!composer.trim() || chat.isPending}>↑</button>
      </form>
    </section>
    {panelOpen && finished && <aside className="review-panel">
      <div className="review-panel-head"><div><p className="eyebrow">Read-only results</p><h2>A/B/C review</h2></div><button onClick={() => setPanelOpen(false)}>×</button></div>
      <p className="review-help">Use this panel to understand how rows were classified. No approval or editing is required.</p>
      <div className="group-tabs">{["A", "B", "C"].map(value => <button className={group === value ? "active" : ""} onClick={() => setGroup(value)} key={value}>{value}<small>{value === "A" ? "Correct" : value === "B" ? "Rules" : "Inference"}</small></button>)}</div>
      <div className="review-rows">{review.isLoading ? <p>Loading rows…</p> : review.data?.items.map((item: JobItem) => <article key={item.row_number}>
        <div><b>{item.item_no}</b><span>Row {item.row_number}</span></div><p>{display(item.original.standard_size)} {display(item.original.standard_uom)} <strong>→</strong> {display(item.field_proposals.standard_size)} {display(item.field_proposals.standard_uom)}</p><small>{display(item.reason_code)} · {display(item.method)}</small>
      </article>)}</div>
    </aside>}
  </div>;
}
