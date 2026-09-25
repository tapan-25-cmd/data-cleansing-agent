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
import { GroupsPage } from "../pages/GroupsPage";
import { AccuracyRulesPage, SequencePage } from "../pages/SequencePage";
import { SampleCheckPage } from "../pages/SampleCheckPage";

export function App() {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span>DFI</span><strong>Data Cleansing</strong></div>
      <p className="eyebrow">Release 1 · UoM</p>
      <nav>
        <NavLink to="/">Agent chat</NavLink>
        <NavLink to="/groups">Groups</NavLink>
        <NavLink to="/rules">Rules</NavLink>
        <NavLink to="/pipeline">Pipeline</NavLink>
        <NavLink to="/sequence">Sequence</NavLink>
        <NavLink to="/accuracy-rules">Accuracy rules</NavLink>
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
        <Route path="/jobs/:jobId/sample-check" element={<SampleCheckPage />} />
        <Route path="/jobs/:jobId/groups" element={<GroupsPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="/jobs/:jobId/sequence" element={<SequencePage />} />
        <Route path="/sequence" element={<SequencePage />} />
        <Route path="/jobs/:jobId/accuracy-rules" element={<AccuracyRulesPage />} />
        <Route path="/accuracy-rules" element={<AccuracyRulesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </div>;
}
