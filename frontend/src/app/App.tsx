import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { UploadPage } from "../pages/UploadPage";
import { ProcessingPage } from "../pages/ProcessingPage";
import { SummaryPage } from "../pages/SummaryPage";
import { GroupBReviewPage } from "../pages/GroupBReviewPage";
import { GroupCReviewPage } from "../pages/GroupCReviewPage";
import { ExportPage } from "../pages/ExportPage";

export function App() {
  const currentJob = localStorage.getItem("uom-current-job");
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span>DFI</span><strong>Data Cleansing</strong></div>
      <p className="eyebrow">Release 1 · UoM</p>
      <nav>
        <NavLink to="/upload">01 Upload</NavLink>
        {currentJob && <NavLink to={`/jobs/${currentJob}/summary`}>02 Review</NavLink>}
      </nav>
      <div className="sidebar-note">Deterministic rules are version-controlled. No mapping administration is exposed here.</div>
    </aside>
    <main className="workspace">
      <Routes>
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/jobs/:jobId/processing" element={<ProcessingPage />} />
        <Route path="/jobs/:jobId/summary" element={<SummaryPage />} />
        <Route path="/jobs/:jobId/review/b" element={<GroupBReviewPage />} />
        <Route path="/jobs/:jobId/review/c" element={<GroupCReviewPage />} />
        <Route path="/jobs/:jobId/export" element={<ExportPage />} />
        <Route path="*" element={<Navigate to="/upload" replace />} />
      </Routes>
    </main>
  </div>;
}
