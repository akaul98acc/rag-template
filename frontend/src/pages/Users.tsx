import { useState, useEffect, type FormEvent } from "react";
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
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  checkEmail,
  listOrganizations,
  listRoles,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";
import type { User, UserCreate, UserUpdate, Organization, Role } from "@/types/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------------------
// FormState
// ---------------------------------------------------------------------------

interface FormState {
  name: string;
  email: string;
  phone_number: string;
  org_id: string;
  role_id: string;
}

function emptyForm(): FormState {
  return { name: "", email: "", phone_number: "", org_id: "", role_id: "" };
}

function userToForm(user: User): FormState {
  return {
    name: user.name,
    email: user.email,
    phone_number: user.phone_number ?? "",
    org_id: user.org_id ?? "",
    role_id: user.role_id ?? "",
  };
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
// UserPanel
// ---------------------------------------------------------------------------

type Mode = "view" | "edit" | "create";

type ReportError = (field: keyof FormState, msg: string) => void;

interface UserPanelProps {
  mode: Mode;
  selected: User | null;
  saving: boolean;
  onClose: () => void;
  onSave: (form: FormState, reportError: ReportError) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function UserPanel({
  mode,
  selected,
  saving,
  onClose,
  onSave,
  onEdit,
  onDelete,
}: UserPanelProps) {
  const [form, setForm] = useState<FormState>(() =>
    mode === "create" ? emptyForm() : selected ? userToForm(selected) : emptyForm()
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [emailChecking, setEmailChecking] = useState(false);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    setForm(mode === "create" ? emptyForm() : selected ? userToForm(selected) : emptyForm());
    setErrors({});
  }, [mode, selected]);

  // Fetch organizations and roles once when panel opens (for dropdowns)
  useEffect(() => {
    listOrganizations({ page_size: 100 })
      .then((res) => setOrgs(res.items))
      .catch(() => {});
    listRoles()
      .then((res) => setRoles(res))
      .catch(() => {});
  }, []);

  async function handleEmailBlur() {
    if (mode !== "create" || !form.email.trim() || !isValidEmail(form.email)) return;
    setEmailChecking(true);
    try {
      const { available } = await checkEmail(form.email);
      if (!available) {
        setErrors((prev) => ({ ...prev, email: "This email is already taken" }));
      } else {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.email;
          return next;
        });
      }
    } catch {
      // silently ignore — server will validate on submit
    } finally {
      setEmailChecking(false);
    }
  }

  function reportError(field: keyof FormState, msg: string) {
    setErrors((prev) => ({ ...prev, [field]: msg }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "Required";
    if (mode === "create") {
      if (!form.email.trim()) next.email = "Required";
      else if (!isValidEmail(form.email)) next.email = "Enter a valid email address";
      if (!form.org_id) next.org_id = "Required";
    }
    if (!form.role_id) next.role_id = "Required";
    // preserve async email error from blur check
    if (!next.email && errors.email) next.email = errors.email;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSave(form, reportError);
  }

  const isReadOnly = mode === "view";
  const title =
    mode === "create"
      ? "Add User"
      : mode === "edit"
        ? "Edit User"
        : (selected?.name ?? "User");

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
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5 flex-1">
          <FieldGroup label="Name" error={errors.name}>
            {isReadOnly ? (
              <p className="text-sm text-fg py-1">{selected?.name}</p>
            ) : (
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jane Smith"
              />
            )}
          </FieldGroup>

          <FieldGroup label="Email" error={errors.email}>
            {isReadOnly || mode === "edit" ? (
              <p className="text-sm text-fg py-1">{selected?.email ?? form.email}</p>
            ) : (
              <div className="relative">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => {
                    setForm({ ...form, email: e.target.value });
                    setErrors((prev) => { const n = { ...prev }; delete n.email; return n; });
                  }}
                  onBlur={handleEmailBlur}
                  placeholder="jane@example.com"
                />
                {emailChecking && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-muted">
                    Checking…
                  </span>
                )}
              </div>
            )}
          </FieldGroup>

          <FieldGroup label="Organization" error={errors.org_id}>
            {isReadOnly || mode === "edit" ? (
              <p className="text-sm text-fg py-1">
                {selected?.org_name ?? "—"}
              </p>
            ) : (
              <select
                value={form.org_id}
                onChange={(e) => {
                  setForm({ ...form, org_id: e.target.value });
                  setErrors((prev) => { const n = { ...prev }; delete n.org_id; return n; });
                }}
                className="flex h-9 w-full rounded-md border border-border-strong bg-surface px-3 py-1 text-sm text-fg shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring-strong"
              >
                <option value="">
                  {orgs.length === 0 ? "No organizations available" : "Select organization…"}
                </option>
                {orgs.map((org) => (
                  <option key={org.org_id} value={org.org_id}>
                    {org.name}
                  </option>
                ))}
              </select>
            )}
          </FieldGroup>

          <FieldGroup label="Role" error={errors.role_id}>
            {isReadOnly ? (
              <p className="text-sm text-fg py-1">{selected?.role_name ?? "—"}</p>
            ) : (
              <select
                value={form.role_id}
                onChange={(e) => {
                  setForm({ ...form, role_id: e.target.value });
                  setErrors((prev) => { const n = { ...prev }; delete n.role_id; return n; });
                }}
                className="flex h-9 w-full rounded-md border border-border-strong bg-surface px-3 py-1 text-sm text-fg shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring-strong"
              >
                <option value="">
                  {roles.length === 0 ? "No roles available" : "Select role…"}
                </option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            )}
          </FieldGroup>

          <FieldGroup label="Phone Number">
            {isReadOnly ? (
              <p className="text-sm text-fg py-1">{selected?.phone_number || "—"}</p>
            ) : (
              <Input
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                placeholder="+1 555 000 0000"
                type="tel"
              />
            )}
          </FieldGroup>

          {mode === "view" && selected && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border text-sm text-fg-muted">
              <div>
                <p className="font-medium text-xs uppercase tracking-wide mb-1">Created</p>
                <p>{formatDate(selected.created_on)}</p>
                <p className="text-xs truncate">{selected.created_by}</p>
              </div>
              <div>
                <p className="font-medium text-xs uppercase tracking-wide mb-1">Updated</p>
                <p>{formatDate(selected.updated_on)}</p>
                <p className="text-xs truncate">{selected.updated_by}</p>
              </div>
            </div>
          )}

          <div className="mt-auto pt-4 flex gap-2 border-t border-border">
            {mode === "view" ? (
              <>
                <Button type="button" onClick={onEdit} className="flex-1">
                  Edit
                </Button>
                <Button type="button" variant="destructive" onClick={onDelete}>
                  Delete
                </Button>
              </>
            ) : (
              <>
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// DeleteConfirm
// ---------------------------------------------------------------------------

interface DeleteConfirmProps {
  user: User;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirm({ user, onConfirm, onCancel }: DeleteConfirmProps) {
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
          Delete user?
        </h3>
        <p className="text-sm text-fg-muted mb-5">
          <strong>{user.name}</strong> ({user.email}) will be removed from the
          system. This action cannot be undone.
        </p>
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
          {Array.from({ length: 5 }).map((_, j) => (
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
// Users page
// ---------------------------------------------------------------------------

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<User | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listUsers({
      page,
      page_size: PAGE_SIZE,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    })
      .then((res) => {
        if (cancelled) return;
        setUsers(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        if (cancelled) return;
        toast({ variant: "destructive", title: "Failed to load users." });
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

  function openView(user: User) {
    setSelected(user);
    setMode("view");
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
  }

  async function handleSave(
    form: FormState,
    reportError: (field: keyof FormState, msg: string) => void
  ) {
    setSaving(true);
    try {
      if (mode === "create") {
        const payload: UserCreate = {
          name: form.name,
          email: form.email,
          org_id: form.org_id,
          role_id: form.role_id,
          ...(form.phone_number ? { phone_number: form.phone_number } : {}),
        };
        await createUser(payload);
        toast({ title: "User created." });
      } else if (mode === "edit" && selected) {
        const payload: UserUpdate = {
          name: form.name,
          role_id: form.role_id,
          ...(form.phone_number ? { phone_number: form.phone_number } : {}),
        };
        await updateUser(selected.id, payload);
        toast({ title: "User updated." });
      }
      setPanelOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      if (hasStatus(err, 409)) {
        reportError("email", "This email is already taken");
      } else {
        toast({ variant: "destructive", title: "Failed to save user." });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      toast({ title: "User deleted." });
      setDeleteTarget(null);
      setPanelOpen(false);
      setRefreshKey((k) => k + 1);
    } catch {
      toast({ variant: "destructive", title: "Failed to delete user." });
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold m-0">Users</h2>
        <Button onClick={openCreate}>Add User</Button>
      </div>

      <div className="flex gap-3 mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="max-w-xs"
        />
      </div>

      <div className="overflow-x-auto bg-surface border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <SkeletonRows />}

            {!loading && users.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-12 text-fg-muted"
                >
                  No users found. Click <strong>Add User</strong> to create the
                  first one.
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              users.map((user) => (
                <TableRow
                  key={user.id}
                  className="cursor-pointer"
                  onClick={() => openView(user)}
                >
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-fg-muted">{user.email}</TableCell>
                  <TableCell className="text-fg-muted">
                    {user.org_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-fg-muted">
                    {user.role_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-fg-muted whitespace-nowrap">
                    {formatDate(user.created_on)}
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
        <UserPanel
          mode={mode}
          selected={selected}
          saving={saving}
          onClose={closePanel}
          onSave={handleSave}
          onEdit={() => setMode("edit")}
          onDelete={() => {
            if (selected) setDeleteTarget(selected);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          user={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
