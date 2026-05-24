import { Link, Route, Routes, Navigate } from "react-router-dom";
import Phase1 from "./pages/Phase1.jsx";
import Phase2 from "./pages/Phase2.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>RAG Builder</h1>
        <nav>
          <Link to="/phase1">Phase 1 · Strategy</Link>
          <Link to="/phase2">Phase 2 · Compare & Generate</Link>
        </nav>
        <ThemeToggle />
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/phase1" replace />} />
          <Route path="/phase1" element={<Phase1 />} />
          <Route path="/phase2" element={<Phase2 />} />
        </Routes>
      </main>
    </div>
  );
}
