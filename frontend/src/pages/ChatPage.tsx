import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createExport, getItems, getJob, getPreview, getSummary, Job, JobItem, sendChatMessage, startProcessing, uploadWorkbook } from "../api/client";

type Message = { id: number; role: "user" | "assistant"; text: string; upload?: boolean };
const starter = "Please do the unit measurement";
const activeStatuses = new Set(["UPLOADED", "VALIDATING", "PROFILING", "PROCESSING", "PROCESSING_RULES", "PROCESSING_DESCRIPTIONS", "CHECKING_DISCREPANCIES", "EXPORTING"]);
const processingStatuses = new Set(["UPLOADED", "VALIDATING", "PROFILING", "PROCESSING", "PROCESSING_RULES", "PROCESSING_DESCRIPTIONS", "CHECKING_DISCREPANCIES"]);

function display(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function fieldComparison(current: unknown, proposed: unknown) {
  const hasProposal = proposed !== null && proposed !== undefined && proposed !== "";
  return <div className="field-comparison"><span>{display(current)}</span>{hasProposal && <><b>→</b><strong>{display(proposed)}</strong></>}</div>;
}

const stageLabels: Record<string, string> = {
  VALIDATING: "Validating workbook",
  PROFILING: "Reading workbook",
  PROCESSING_RULES: "Validating rows and applying unit rules",
  PROCESSING_DESCRIPTIONS: "Running description inference",
  CHECKING_DISCREPANCIES: "Checking description discrepancies",
  SAVING_RESULTS: "Saving results",
};

function progressText(progress?: Job["progress"]) {
  if (!progress) return "Starting…";
  const noun = progress.unit === "AGENT_CALLS" ? "agent checks completed" : "rows processed";
  const processed = (progress.processed || 0).toLocaleString();
  const total = progress.total ? ` of ${progress.total.toLocaleString()}` : "";
  return `${processed}${total} ${noun} · ${progress.percent || 0}% overall`;
}

export function ChatPage() {
  const queryClient = useQueryClient();
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
    refetchInterval: query => activeStatuses.has(query.state.data?.status || "") ? 2500 : false,
  });
  const reviewReady = job.data?.status === "READY_FOR_REVIEW" || job.data?.status === "EXPORTING" || job.data?.status === "EXPORTED";
  const processing = Boolean(job.data?.status && processingStatuses.has(job.data.status));
  const summary = useQuery({ queryKey: ["summary", jobId], queryFn: () => getSummary(jobId), enabled: Boolean(jobId) && reviewReady });
  const preview = useQuery({ queryKey: ["preview", jobId], queryFn: () => getPreview(jobId), enabled: Boolean(jobId) && reviewReady });
  const review = useQuery({ queryKey: ["review-preview", jobId, group], queryFn: () => getItems(jobId, group, 1, 50), enabled: Boolean(jobId) && reviewReady && panelOpen });
  const exporter = useMutation({ mutationFn: () => createExport(jobId), onSuccess: () => job.refetch(), onError: err => setError(err.message) });

  useEffect(() => {
    if (reviewReady) setPanelOpen(true);
  }, [reviewReady]);

  const startNewConversation = () => {
    if ((processing || exporting) && !window.confirm("Start a new conversation? The current job will continue in the background, but it will no longer be shown in this chat.")) return;
    const previousJobId = jobId;
    localStorage.removeItem("uom-current-job");
    setJobId("");
    setMessages([
      { id: 1, role: "assistant", text: "Hello — I can cleanse and standardize unit-of-measure data in your workbook." },
    ]);
    nextMessage.current = 2;
    setComposer("");
    setPanelOpen(false);
    setGroup("A");
    setError("");
    chat.reset();
    exporter.reset();
    if (fileInput.current) fileInput.current.value = "";
    if (previousJobId) queryClient.removeQueries({ predicate: query => query.queryKey.includes(previousJobId) });
  };

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
  const rawStage = display(job.data?.progress.stage);
  const stage = stageLabels[rawStage] || rawStage.replaceAll("_", " ");
  return <div className={`chat-layout ${panelOpen && reviewReady ? "with-review" : ""}`}>
    <section className="chat-main">
      <header className="chat-header">
        <div><p className="eyebrow">UOM cleansing agent</p><h2>Data cleansing conversation</h2></div>
        <div className="chat-header-actions">
          {reviewReady && <button className="secondary" onClick={() => setPanelOpen(value => !value)}>{panelOpen ? "Hide" : "View"} A/B/C results</button>}
          <button className="new-conversation" onClick={startNewConversation}><span aria-hidden="true">＋</span> New conversation</button>
        </div>
      </header>
      <div className="conversation">
        {messages.map(message => <div className={`message ${message.role}`} key={message.id}>
          <div className="avatar">{message.role === "assistant" ? "DFI" : "You"}</div>
          <div className="bubble"><p>{message.text}</p>{message.upload && <button className="upload-action" onClick={() => fileInput.current?.click()}><span>＋</span> Upload Excel workbook</button>}</div>
        </div>)}
        {!jobId && messages.length === 1 && <button className="starter-card" onClick={() => setComposer(starter)}><span>↗</span><div><strong>Clean unit measurements</strong><small>{starter}</small></div></button>}
        {jobId && processing && job.data?.status !== "FAILED" && <div className="message assistant">
          <div className="avatar">DFI</div>
          <div className="bubble progress-bubble">
            <div className="typing-loader" aria-hidden="true"><span /><span /><span /></div>
            <div>
              <strong className="shimmer-text">{stage}</strong>
              <p>{progressText(job.data?.progress)}</p>
              <div className="progress-rail" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.data?.progress.percent || 0}><span style={{ width: `${job.data?.progress.percent || 0}%` }} /></div>
            </div>
          </div>
        </div>}
        {job.data?.status === "FAILED" && <div className="alert error">{job.data.error || "Processing failed."}</div>}
        {reviewReady && stats && <div className="message assistant result-message">
          <div className="avatar">DFI</div>
          <div className="bubble result-card">
          <div className="result-heading"><div><p className="eyebrow">Processing complete</p><h2>Your workbook is ready</h2></div><div className="result-heading-actions"><button className="secondary" onClick={() => setPanelOpen(true)}>View A/B/C</button><Link className="secondary" to={`/jobs/${jobId}/results`}>View detailed results</Link><Link className="secondary" to={`/jobs/${jobId}/performance`}>Agent performance</Link></div></div>
          <p className="agent-result-summary">I processed <strong>{display(stats.department_rows)}</strong> selected rows. <strong>{display(stats.purged)}</strong> purged rows were excluded, leaving <strong>{display(stats.live)}</strong> live rows: <strong>{display(stats.group_a)}</strong> validated as A, <strong>{display(stats.group_b)}</strong> handled through deterministic B rules, and <strong>{display(stats.group_c)}</strong> sent through C description inference.</p>
          <div className="stat-strip">
            <span><small>Selected rows</small><strong>{display(stats.department_rows)}</strong></span>
            <span className="stat-purged"><small>Purged</small><strong>{display(stats.purged)}</strong></span>
            <span><small>Live rows</small><strong>{display(stats.live)}</strong></span>
            <span className="stat-a"><small>A · Validated</small><strong>{display(stats.group_a)}</strong></span>
            <span className="stat-b"><small>B · Rule fixes</small><strong>{display(stats.group_b)}</strong></span>
            <span className="stat-c"><small>C · Inferred</small><strong>{display(stats.group_c)}</strong></span>
          </div>
          <p className="validation-note">Pack size: {display((stats.pack_deterministic_proposed || 0) + (stats.pack_agent_proposed || 0))} proposed · {display(stats.pack_conflict || 0)} conflicts · {display(stats.pack_agent_error || 0)} agent errors.</p>
          {(stats.group_a_validation_warnings || 0) > 0 && <p className="validation-note">{display(stats.group_a_validation_warnings)} validated A rows include non-blocking legacy or description warnings.</p>}
          {(stats.discrepancies || 0) > 0 && <p className="validation-note"><strong>{display(stats.discrepancies)}</strong> rows have English and local-language text that disagree ({display(stats.discrepancy_bilingual_measurement_conflicts || 0)} on size, {display(stats.discrepancy_bilingual_count_conflicts || 0)} on pack count). They need human review; no value was chosen automatically.</p>}
          {(summary.data?.rule_readiness?.uncovered_affected_rows || 0) > 0 && <p className="validation-note mapping-note"><strong>{display(summary.data?.rule_readiness?.uncovered_affected_rows)}</strong> rows use units without confirmed mapping rules: {summary.data?.rule_readiness?.uncovered_source_uoms?.join(", ")}.</p>}
          <div className="preview-table"><table><thead><tr><th>Item number</th><th>Group</th><th><span className="excel-column">K</span> Standardize Unit Size</th><th><span className="excel-column">L</span> Standardize UOM</th><th><span className="excel-column">M</span> Standardize Pack Size</th><th>Method</th></tr></thead><tbody>
            {preview.data?.items.map(item => <tr key={item.row_number}><td>{item.item_no}</td><td><b className={`group-pill group-${item.group.toLowerCase()}`}>{item.group}</b></td><td>{fieldComparison(item.original.standard_size, item.field_proposals.standard_size)}</td><td>{fieldComparison(item.original.standard_uom, item.field_proposals.standard_uom)}</td><td>{fieldComparison(item.original.standard_pack_size, item.field_proposals.standard_pack_size)}</td><td>{display(item.method)}</td></tr>)}
          </tbody></table></div>
          {exporting && <div className="export-status"><div className="typing-loader" aria-hidden="true"><span /><span /><span /></div><div><strong className="shimmer-text">{stage}</strong><p>Updating only the standardized size, UOM, and pack-size fields. The rest of the workbook is preserved.</p><div className="shimmer-rail" /></div></div>}
          {exported ? <a className="primary download" href={`/api/jobs/${jobId}/download`}>Download cleansed workbook</a> : <button className="primary" disabled={exporting} onClick={() => exporter.mutate()}>{exporting ? "Generating workbook…" : "Generate and download workbook"}</button>}
          <small className="policy-note">Review is optional. Pending A/B/C items do not block export.</small>
          </div>
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
    {panelOpen && reviewReady && <aside className="review-panel">
      <div className="review-panel-head"><div><p className="eyebrow">Read-only results</p><h2>A/B/C review</h2></div><button onClick={() => setPanelOpen(false)}>×</button></div>
      <p className="review-help">Use this panel to understand how rows were classified. No approval or editing is required.</p>
      <div className="group-tabs">{[
        { value: "A", label: "Validated" },
        { value: "B", label: "Rules" },
        { value: "C", label: "Inference" },
        ...((stats?.validation_review || 0) > 0 ? [{ value: "VALIDATION_REVIEW", label: "Review" }] : []),
        ...((stats?.data_shape_error || 0) > 0 ? [{ value: "DATA_SHAPE_ERROR", label: "Invalid" }] : []),
      ].map(option => <button className={group === option.value ? "active" : ""} onClick={() => setGroup(option.value)} key={option.value}>{option.value.length === 1 ? option.value : "!"}<small>{option.label}</small></button>)}</div>
      <div className="review-rows">{review.isLoading ? <p>Loading rows…</p> : review.data?.items.map((item: JobItem) => <article key={item.row_number}>
        <div><b>{item.item_no}</b><span>Row {item.row_number}</span></div><p>{display(item.original.standard_size)} {display(item.original.standard_uom)} × {display(item.original.standard_pack_size)} <strong>→</strong> {display(item.field_proposals.standard_size)} {display(item.field_proposals.standard_uom)} × {display(item.field_proposals.standard_pack_size)}</p><small>{display(item.reason_code)} · {display(item.method)}</small>
        {item.pack_result && <small className="validation-summary">M · {display(item.pack_result.status)} · {display(item.field_provenance?.standard_pack_size?.method)}</small>}
        {item.validation && <small className="validation-summary">{item.validation.status} · {item.validation.issues.length} validation note{item.validation.issues.length === 1 ? "" : "s"}</small>}
      </article>)}</div>
    </aside>}
  </div>;
}
