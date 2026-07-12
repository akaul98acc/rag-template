import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  checkRoleName,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";
import type { Role, RoleCreate, RoleUpdate } from "@/types/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

const SEEDED_NAMES = new Set(["Admin", "Manager", "User", "Viewer"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function hasStatus(err: unknown, status: number): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as { response: unknown }).response === "object" &&
    (err as { response: { status: unknown } }).response !== null &&
    (err as { response: { status: unknown } }).response.status === status
  );
}

function getDetail(err: unknown): string | null {
  if (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as { response: unknown }).response === "object" &&
    (err as { response: { data?: { detail?: string } } }).response !== null
  ) {
    return (
      (err as { response: { data?: { detail?: string } } }).response.data
        ?.detail ?? null
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// FieldGroup
// ---------------------------------------------------------------------------

interface FieldGroupProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

function FieldGroup({ label, error, children }: FieldGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-fg">{label}</label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RolePanel
// ---------------------------------------------------------------------------

type Mode = "view" | "edit" | "create";

interface RolePanelProps {
  mode: Mode;
  selected: Role | null;
  saving: boolean;
  onClose: () => void;
  onSave: (name: string, reportError: (msg: string) => void) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}

function RolePanel({
  mode,
  selected,
  saving,
  onClose,
  onSave,
  onEdit,
  onCancelEdit,
  onDelete,
}: RolePanelProps) {
  const [name, setName] = useState(
    mode === "create" ? "" : (selected?.name ?? "")
  );
  const [error, setError] = useState<string | undefined>();
  const [nameChecking, setNameChecking] = useState(false);

  useEffect(() => {
    setName(mode === "create" ? "" : (selected?.name ?? ""));
    setError(undefined);
  }, [mode, selected]);

  const isReadOnly = mode === "view";
  const isSeeded = selected ? SEEDED_NAMES.has(selected.name) : false;

  async function handleNameBlur() {
    if (mode !== "create" || !name.trim()) return;
    setNameChecking(true);
    try {
      const { available } = await checkRoleName(name.trim());
      if (!available) setError("Role name already exists");
      else setError(undefined);
    } catch {
      // silently ignore
    } finally {
      setNameChecking(false);
    }
  }

  function handleSubmit() {
    if (!name.trim()) {
      setError("Required");
      return;
    }
    if (error) return;
    onSave(name.trim(), (msg) => setError(msg));
  }

  const title =
    mode === "create"
      ? "Add Role"
      : mode === "edit"
        ? "Edit Role"
        : (selected?.name ?? "Role");

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label={title}
        className="fixed right-0 top-0 h-full w-full max-w-md bg-surface border-l border-border shadow-xl z-50 flex flex-col overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold m-0">{title}</h2>
          <button
            type="button"
            className="text-fg-muted hover:text-fg p-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring-strong"
            onClick={onClose}
            aria-label="Close panel"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5 flex-1">
          {isSeeded && (
            <div className="flex items-center gap-2 rounded-md bg-fg-subtle/10 border border-border px-3 py-2 text-sm text-fg-muted">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Protected system role — cannot be edited or deleted.
            </div>
          )}

          <FieldGroup label="Role Name" error={error}>
            {isReadOnly ? (
              <p className="text-sm text-fg py-1">{selected?.name}</p>
            ) : (
              <div className="relative">
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(undefined);
                  }}
                  onBlur={handleNameBlur}
                  placeholder="e.g. Analyst"
                  disabled={isSeeded}
                />
                {nameChecking && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-muted">
                    Checking…
                  </span>
                )}
              </div>
            )}
          </FieldGroup>

          {mode !== "create" && selected && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border text-sm text-fg-muted">
              <div>
                <p className="font-medium text-xs uppercase tracking-wide mb-1">
                  Created
                </p>
                <p>{formatDate(selected.created_on)}</p>
                <p className="text-xs truncate">{selected.created_by}</p>
              </div>
              <div>
                <p className="font-medium text-xs uppercase tracking-wide mb-1">
                  Updated
                </p>
                <p>{formatDate(selected.updated_on)}</p>
                <p className="text-xs truncate">{selected.updated_by}</p>
              </div>
            </div>
          )}

          <div className="mt-auto pt-4 flex gap-2 border-t border-border">
            {mode === "view" ? (
              <>
                {!isSeeded && (
                  <Button type="button" onClick={onEdit} className="flex-1">
                    Edit
                  </Button>
                )}
                {!isSeeded && (
                  <Button type="button" variant="destructive" onClick={onDelete}>
                    Delete
                  </Button>
                )}
                {isSeeded && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onClose}
                    className="flex-1"
                  >
                    Close
                  </Button>
                )}
              </>
            ) : mode === "edit" ? (
              <>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={handleSubmit}
                  className="flex-1"
                >
                  {saving ? "Updating…" : "Update"}
                </Button>
                <Button type="button" variant="secondary" onClick={onCancelEdit}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={handleSubmit}
                  className="flex-1"
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// DeleteConfirm
// ---------------------------------------------------------------------------

interface DeleteConfirmProps {
  role: Role;
  deleteError: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirm({
  role,
  deleteError,
  onConfirm,
  onCancel,
}: DeleteConfirmProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-labelledby="del-title"
        className="relative bg-surface border border-border rounded-lg p-6 w-full max-w-sm shadow-xl"
      >
        <h3 id="del-title" className="text-base font-semibold mb-2 m-0">
          Delete role?
        </h3>
        <p className="text-sm text-fg-muted mb-3">
          <strong>{role.name}</strong> will be permanently removed from the
          system.
        </p>
        {deleteError && (
          <p className="text-sm text-danger mb-3">{deleteError}</p>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkeletonRows
// ---------------------------------------------------------------------------

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 4 }).map((_, j) => (
            <TableCell key={j}>
              <div className="h-4 bg-fg-subtle/20 rounded animate-pulse" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Roles page
// ---------------------------------------------------------------------------

export default function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Role | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Debounce search input — reset to page 1 on change
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  // Fetch list
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listRoles({
      page,
      page_size: PAGE_SIZE,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    })
      .then((res) => {
        if (cancelled) return;
        setRoles(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        if (cancelled) return;
        toast({ variant: "destructive", title: "Failed to load roles." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, total);

  function openCreate() {
    setSelected(null);
    setMode("create");
    setPanelOpen(true);
  }

  function openView(role: Role) {
    setSelected(role);
    setMode("view");
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
  }

  async function handleSave(
    name: string,
    reportError: (msg: string) => void
  ) {
    setSaving(true);
    try {
      if (mode === "create") {
        const payload: RoleCreate = { name };
        await createRole(payload);
        toast({ title: "Role created." });
      } else if (mode === "edit" && selected) {
        const payload: RoleUpdate = { name };
        await updateRole(selected.id, payload);
        toast({ title: "Role updated." });
      }
      setPanelOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      if (hasStatus(err, 409)) {
        reportError("Role name already exists");
      } else if (hasStatus(err, 403)) {
        reportError(getDetail(err) ?? "This role cannot be modified");
      } else {
        toast({ variant: "destructive", title: "Failed to save role." });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteRole(deleteTarget.id);
      toast({ title: "Role deleted." });
      setDeleteTarget(null);
      setPanelOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      if (hasStatus(err, 409) || hasStatus(err, 403)) {
        setDeleteError(getDetail(err) ?? "Cannot delete this role.");
      } else {
        toast({ variant: "destructive", title: "Failed to delete role." });
        setDeleteTarget(null);
      }
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold m-0">Roles</h2>
        <Button onClick={openCreate}>Add Role</Button>
      </div>

      <div className="flex gap-3 mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by role name…"
          className="max-w-xs"
        />
      </div>

      <div className="overflow-x-auto bg-surface border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role Name</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead>Created On</TableHead>
              <TableHead>Updated On</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <SkeletonRows />}

            {!loading && roles.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-12 text-fg-muted"
                >
                  No roles found. Click <strong>Add Role</strong> to create the
                  first one.
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              roles.map((role) => (
                <TableRow
                  key={role.id}
                  className="cursor-pointer"
                  onClick={() => openView(role)}
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {role.name}
                      {SEEDED_NAMES.has(role.name) && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-fg-muted"
                          aria-label="Protected role"
                        >
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-fg-muted">
                    {role.created_by}
                  </TableCell>
                  <TableCell className="text-fg-muted whitespace-nowrap">
                    {formatDate(role.created_on)}
                  </TableCell>
                  <TableCell className="text-fg-muted whitespace-nowrap">
                    {formatDate(role.updated_on)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-fg-muted">
        <span>
          {total === 0
            ? "No results"
            : `Showing ${startItem}–${endItem} of ${total}`}
        </span>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            &lt; Prev
          </Button>
          <span>
            Page {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next &gt;
          </Button>
        </div>
      </div>

      {panelOpen && (
        <RolePanel
          mode={mode}
          selected={selected}
          saving={saving}
          onClose={closePanel}
          onSave={handleSave}
          onEdit={() => setMode("edit")}
          onCancelEdit={() => setMode("view")}
          onDelete={() => {
            if (selected) {
              setDeleteError(null);
              setDeleteTarget(selected);
            }
          }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          role={deleteTarget}
          deleteError={deleteError}
          onConfirm={handleDelete}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
        />
      )}
    </section>
  );
}
