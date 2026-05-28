import { Link, Route, Routes, Navigate } from "react-router-dom";
import Phase1 from "./pages/Phase1";
import Phase2 from "./pages/Phase2";
import ThemeToggle from "./components/ThemeToggle";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-bg text-fg">
      <header className="flex items-center gap-6 px-8 py-4 bg-surface border-b border-border">
        <h1 className="m-0 text-xl font-semibold">RAG Builder</h1>
        <nav className="flex-1">
          <Link
            to="/phase1"
            aria-label="Go to Phase 1 — Strategy"
            className="mr-6 text-primary font-medium no-underline hover:underline"
          >
            Phase 1 · Strategy
          </Link>
          <Link
            to="/phase2"
            aria-label="Go to Phase 2 — Compare and Generate"
            className="mr-6 text-primary font-medium no-underline hover:underline"
          >
            Phase 2 · Compare & Generate
          </Link>
        </nav>
        <ThemeToggle />
      </header>
      <main className="max-w-[960px] w-full mx-auto px-8 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/phase1" replace />} />
          <Route path="/phase1" element={<Phase1 />} />
          <Route path="/phase2" element={<Phase2 />} />
        </Routes>
      </main>
    </div>
  );
}
