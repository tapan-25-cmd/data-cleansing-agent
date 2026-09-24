import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ChatPage } from "../pages/ChatPage";
import { PerformancePage } from "../pages/PerformancePage";
import { ResultsPage } from "../pages/ResultsPage";
import { PastNewPage } from "../pages/PastNewPage";
import { OpenQuestionsPage } from "../pages/OpenQuestionsPage";
import { RulesPage } from "../pages/RulesPage";
import { PipelinePage } from "../pages/PipelinePage";
import { AccuracyPage } from "../pages/AccuracyPage";
import { BlindTestPage } from "../pages/BlindTestPage";

export function App() {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span>DFI</span><strong>Data Cleansing</strong></div>
      <p className="eyebrow">Release 1 · UoM</p>
      <nav>
        <NavLink to="/">Agent chat</NavLink>
        <NavLink to="/rules">Rules</NavLink>
        <NavLink to="/pipeline">Pipeline</NavLink>
      </nav>
      <div className="sidebar-note">Deterministic rules are version-controlled. No mapping administration is exposed here.</div>
    </aside>
    <main className="workspace">
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/jobs/:jobId/results" element={<ResultsPage />} />
        <Route path="/jobs/:jobId/performance" element={<PerformancePage />} />
        <Route path="/jobs/:jobId/comparison" element={<PastNewPage />} />
        <Route path="/jobs/:jobId/open-questions" element={<OpenQuestionsPage />} />
        <Route path="/jobs/:jobId/rules" element={<RulesPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/jobs/:jobId/pipeline" element={<PipelinePage />} />
        <Route path="/jobs/:jobId/accuracy" element={<AccuracyPage />} />
        <Route path="/jobs/:jobId/blind-test" element={<BlindTestPage />} />
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </div>;
}
