import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ChatPage } from "../pages/ChatPage";

export function App() {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span>DFI</span><strong>Data Cleansing</strong></div>
      <p className="eyebrow">Release 1 · UoM</p>
      <nav>
        <NavLink to="/">Agent chat</NavLink>
      </nav>
      <div className="sidebar-note">Deterministic rules are version-controlled. No mapping administration is exposed here.</div>
    </aside>
    <main className="workspace">
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </div>;
}
