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
const HIDDEN_NAMES = new Set(["Super Admin"]);

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
      (err as { response: { data?: { detail?: string } } }).response.data?.detail ?? null
    );
  }
  return null;
}

// Lock icon SVG used in both the table and the panel
function LockIcon() {
  return (
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
  const [name, setName] = useState(mode === "create" ? "" : (selected?.name ?? ""));
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

  const buttons: ActionButton[] =
    mode === "view"
      ? isSeeded
        ? [{ label: "Close", onClick: onClose, variant: "secondary", flex1: true }]
        : [
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
// Roles page
// ---------------------------------------------------------------------------

export default function Roles() {
  const [selected, setSelected] = useState<Role | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { items: rawRoles, total: rawTotal, page, setPage, search, setSearch, loading, refresh } =
    useEntityList<Role>({
      fetcher: (params) => listRoles(params),
      pageSize: PAGE_SIZE,
    });

  const roles = rawRoles.filter((r) => !HIDDEN_NAMES.has(r.name));
  const total = rawTotal - (rawRoles.length - roles.length);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

  async function handleSave(name: string, reportError: (msg: string) => void) {
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
      refresh();
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
      refresh();
    } catch (err: unknown) {
      if (hasStatus(err, 409) || hasStatus(err, 403)) {
        setDeleteError(getDetail(err) ?? "Cannot delete this role.");
      } else {
        toast({ variant: "destructive", title: "Failed to delete role." });
        setDeleteTarget(null);
      }
    }
  }

  const columns: ColumnDef<Role>[] = [
    {
      key: "name",
      label: "Role Name",
      render: (r) => (
        <span className="flex items-center gap-2 font-medium">
          {r.name}
          {SEEDED_NAMES.has(r.name) && <LockIcon />}
        </span>
      ),
    },
    { key: "created_by", label: "Created By", className: "text-fg-muted" },
    {
      key: "created_on",
      label: "Created On",
      render: (r) => (
        <span className="text-fg-muted whitespace-nowrap">{formatDate(r.created_on)}</span>
      ),
    },
    {
      key: "updated_on",
      label: "Updated On",
      render: (r) => (
        <span className="text-fg-muted whitespace-nowrap">{formatDate(r.updated_on)}</span>
      ),
    },
  ];

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

      <DataTable
        columns={columns}
        rows={roles}
        loading={loading}
        getRowKey={(r) => r.id}
        onRowClick={openView}
        skeletonRows={5}
        emptyMessage={
          <>
            No roles found. Click <strong>Add Role</strong> to create the first one.
          </>
        }
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

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
        <ConfirmModal
          title="Delete role?"
          description={
            <>
              <strong>{deleteTarget.name}</strong> will be permanently removed from the system.
            </>
          }
          error={deleteError}
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
