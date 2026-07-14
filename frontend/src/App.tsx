import { type ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import ThemeToggle from "./components/ThemeToggle";
import { Toaster } from "./components/ui/toaster";
import { useAuth } from "@/contexts/AuthContext";
import { UploadProvider } from "@/contexts/UploadContext";
import { buildNavLinks, isSuperAdmin } from "@/lib/session-utils";
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

function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { claims, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isSuperAdmin(claims)) return <Navigate to="/step1" replace />;
  return <>{children}</>;
}

function AppLayout() {
  const { claims, isAuthenticated, logout } = useAuth();
  const navLinks = buildNavLinks(isAuthenticated ? claims : null);

  return (
    <UploadProvider>
      <div className="min-h-screen flex flex-col bg-bg text-fg">
        <header className="flex items-center gap-3 px-6 py-3 bg-surface border-b border-border">
          <h1 className="m-0 text-lg font-semibold shrink-0">RAG Builder</h1>
          <nav className="flex-1 flex items-center gap-4 min-w-0">
            {isAuthenticated && navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                aria-label={link.ariaLabel}
                className="text-sm text-primary font-medium no-underline hover:underline whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          {claims && (
            <span className="text-xs text-fg-muted hidden lg:inline shrink-0 max-w-[160px] truncate">
              {claims.email}
            </span>
          )}
          <ThemeToggle />
          {claims && (
            <button
              onClick={logout}
              className="text-sm text-primary font-medium hover:underline shrink-0"
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
            <Route path="/organizations" element={<RequireSuperAdmin><Organizations /></RequireSuperAdmin>} />
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
