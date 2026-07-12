import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  SlidePanel,
  ConfirmModal,
  FieldGroup,
  PanelActionBar,
} from "@/components/shared";
import type { ColumnDef, ActionButton } from "@/components/shared";
import { useEntityList } from "@/hooks/useEntityList";
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
  onCancelEdit: () => void;
  onDelete: () => void;
}

function UserPanel({
  mode,
  selected,
  saving,
  onClose,
  onSave,
  onEdit,
  onCancelEdit,
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
    listRoles({ page_size: 100 })
      .then((res) => setRoles(res.items))
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
    if (!next.email && errors.email) next.email = errors.email;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit() {
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

  const buttons: ActionButton[] =
    mode === "view"
      ? [
          { label: "Edit", onClick: onEdit, flex1: true },
          { label: "Delete", onClick: onDelete, variant: "destructive" },
        ]
      : mode === "edit"
        ? [
            { label: saving ? "Updating…" : "Update", onClick: handleSubmit, disabled: saving, flex1: true },
            { label: "Cancel", onClick: onCancelEdit, variant: "secondary" },
          ]
        : [
            { label: saving ? "Saving…" : "Save", onClick: handleSubmit, disabled: saving, flex1: true },
            { label: "Cancel", onClick: onClose, variant: "secondary" },
          ];

  return (
    <SlidePanel title={title} onClose={onClose} footer={<PanelActionBar buttons={buttons} />}>
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
          <p className="text-sm text-fg py-1">{selected?.org_name ?? "—"}</p>
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
    </SlidePanel>
  );
}

// ---------------------------------------------------------------------------
// Users page
// ---------------------------------------------------------------------------

export default function Users() {
  const [selected, setSelected] = useState<User | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const { items: users, total, page, setPage, search, setSearch, loading, refresh } =
    useEntityList<User>({
      fetcher: (params) => listUsers(params),
      pageSize: PAGE_SIZE,
    });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
      refresh();
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
      refresh();
    } catch {
      toast({ variant: "destructive", title: "Failed to delete user." });
    }
  }

  const columns: ColumnDef<User>[] = [
    {
      key: "name",
      label: "Name",
      render: (u) => <span className="font-medium">{u.name}</span>,
    },
    { key: "email", label: "Email", className: "text-fg-muted" },
    {
      key: "org_name",
      label: "Organization",
      render: (u) => <span className="text-fg-muted">{u.org_name ?? "—"}</span>,
    },
    {
      key: "role_name",
      label: "Role",
      render: (u) => <span className="text-fg-muted">{u.role_name ?? "—"}</span>,
    },
    {
      key: "created_on",
      label: "Created",
      render: (u) => (
        <span className="text-fg-muted whitespace-nowrap">{formatDate(u.created_on)}</span>
      ),
    },
  ];

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

      <DataTable
        columns={columns}
        rows={users}
        loading={loading}
        getRowKey={(u) => u.id}
        onRowClick={openView}
        emptyMessage={
          <>
            No users found. Click <strong>Add User</strong> to create the first one.
          </>
        }
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {panelOpen && (
        <UserPanel
          mode={mode}
          selected={selected}
          saving={saving}
          onClose={closePanel}
          onSave={handleSave}
          onEdit={() => setMode("edit")}
          onCancelEdit={() => setMode("view")}
          onDelete={() => {
            if (selected) setDeleteTarget(selected);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete user?"
          description={
            <>
              <strong>{deleteTarget.name}</strong> ({deleteTarget.email}) will be removed from the
              system. This action cannot be undone.
            </>
          }
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
