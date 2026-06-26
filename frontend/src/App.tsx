import { Link, Route, Routes, Navigate } from "react-router-dom";
import Step1 from "./pages/Step1";
import Step2 from "./pages/Step2";
import History from "./pages/History";
import ThemeToggle from "./components/ThemeToggle";
import { Toaster } from "./components/ui/toaster";
import { UploadProvider } from "@/contexts/UploadContext";

export default function App() {
  return (
    <UploadProvider>
    <div className="min-h-screen flex flex-col bg-bg text-fg">
      <header className="flex items-center gap-6 px-8 py-4 bg-surface border-b border-border">
        <h1 className="m-0 text-xl font-semibold">RAG Builder</h1>
        <nav className="flex-1">
          <Link
            to="/step1"
            aria-label="Go to Step 1 — Strategy"
            className="mr-6 text-primary font-medium no-underline hover:underline"
          >
            Step 1 · Strategy
          </Link>
          <Link
            to="/step2"
            aria-label="Go to Step 2 — Compare and Generate"
            className="mr-6 text-primary font-medium no-underline hover:underline"
          >
            Step 2 · Compare & Generate
          </Link>
          <Link
            to="/history"
            aria-label="Go to History"
            className="mr-6 text-primary font-medium no-underline hover:underline"
          >
            History
          </Link>
        </nav>
        <ThemeToggle />
      </header>
      <main className="max-w-[960px] w-full mx-auto px-8 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/step1" replace />} />
          <Route path="/step1" element={<Step1 />} />
          <Route path="/step2" element={<Step2 />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
      <Toaster />
    </div>
    </UploadProvider>
  );
}
