import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { startProcessing, uploadWorkbook } from "../api/client";

export function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const job = await uploadWorkbook(file);
      localStorage.setItem("uom-current-job", job.job_id);
      await startProcessing(job.job_id);
      navigate(`/jobs/${job.job_id}/processing`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
      setBusy(false);
    }
  }

  return <section className="page narrow">
    <p className="eyebrow">New cleansing run</p>
    <h1>Bring the source. Keep the structure.</h1>
    <p className="lede">Upload the UoM snapshot. We process only Grocery 2 and Dairy & Frozen, preserve every source row, and never alter legacy size fields.</p>
    <form className="upload-card" onSubmit={submit}>
      <label className="dropzone">
        <input type="file" accept=".xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <span className="drop-icon">↑</span>
        <strong>{file?.name ?? "Choose an Excel workbook"}</strong>
        <small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ".xlsx · maximum 100 MB"}</small>
      </label>
      <div className="scope-row"><span>Scope locked</span><strong>03 Grocery 2 · 06 Dairy & Frozen</strong></div>
      {error && <div className="alert error">{error}</div>}
      <button className="primary" disabled={!file || busy}>{busy ? "Validating…" : "Upload and process"}</button>
    </form>
  </section>;
}
