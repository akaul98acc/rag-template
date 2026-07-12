import { type ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import ThemeToggle from "./components/ThemeToggle";
import { Toaster } from "./components/ui/toaster";
import { useAuth } from "@/contexts/AuthContext";
import { UploadProvider } from "@/contexts/UploadContext";
import History from "./pages/History";
import Login from "./pages/Login";
import Organizations from "./pages/Organizations";
import Roles from "./pages/Roles";
import Step1 from "./pages/Step1";
import Step2 from "./pages/Step2";
import Users from "./pages/Users";

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppLayout() {
  const { claims, isAuthenticated, logout } = useAuth();

  return (
    <UploadProvider>
      <div className="min-h-screen flex flex-col bg-bg text-fg">
        <header className="flex items-center gap-6 px-8 py-4 bg-surface border-b border-border">
          <h1 className="m-0 text-xl font-semibold">RAG Builder</h1>
          <nav className="flex-1">
            {isAuthenticated && (
              <>
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
                <Link
                  to="/organizations"
                  aria-label="Go to Organizations"
                  className="mr-6 text-primary font-medium no-underline hover:underline"
                >
                  Organizations
                </Link>
                <Link
                  to="/roles"
                  aria-label="Go to Roles"
                  className="mr-6 text-primary font-medium no-underline hover:underline"
                >
                  Roles
                </Link>
                <Link
                  to="/users"
                  aria-label="Go to Users"
                  className="mr-6 text-primary font-medium no-underline hover:underline"
                >
                  Users
                </Link>
              </>
            )}
          </nav>
          {claims && (
            <span className="text-sm text-fg-muted hidden sm:inline">
              {claims.email}
            </span>
          )}
          <ThemeToggle />
          {claims && (
            <button
              onClick={logout}
              className="text-sm text-primary font-medium hover:underline"
              aria-label="Sign out"
            >
              Sign out
            </button>
          )}
        </header>
        <main className="max-w-[960px] w-full mx-auto px-8 py-8">
          <Routes>
            <Route path="/" element={<RequireAuth><Navigate to="/step1" replace /></RequireAuth>} />
            <Route path="/step1" element={<RequireAuth><Step1 /></RequireAuth>} />
            <Route path="/step2" element={<RequireAuth><Step2 /></RequireAuth>} />
            <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
            <Route path="/organizations" element={<RequireAuth><Organizations /></RequireAuth>} />
            <Route path="/roles" element={<RequireAuth><Roles /></RequireAuth>} />
            <Route path="/users" element={<RequireAuth><Users /></RequireAuth>} />
          </Routes>
        </main>
        <Toaster />
      </div>
    </UploadProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<AppLayout />} />
    </Routes>
  );
}
