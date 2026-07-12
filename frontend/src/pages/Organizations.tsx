import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  listOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  checkOrgCode,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";
import type {
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
} from "@/types/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;
const PLAN_OPTIONS = ["free", "pro", "team", "enterprise"] as const;
type PlanType = (typeof PLAN_OPTIONS)[number];

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

// ---------------------------------------------------------------------------
// FormState
// ---------------------------------------------------------------------------

interface FormState {
  name: string;
  org_code: string;
  website: string;
  phone_number: string;
  contact_person: string;
  plan_selected: string;
}

function emptyForm(): FormState {
  return {
    name: "",
    org_code: "",
    website: "",
    phone_number: "",
    contact_person: "",
    plan_selected: PLAN_OPTIONS[0] ?? "",
  };
}

function orgToForm(org: Organization): FormState {
  return {
    name: org.name,
    org_code: org.org_code,
    website: org.website ?? "",
    phone_number: org.phone_number ?? "",
    contact_person: org.contact_person,
    plan_selected: org.plan_selected,
  };
}

// ---------------------------------------------------------------------------
// OrgPanel
// ---------------------------------------------------------------------------

type Mode = "view" | "edit" | "create";

type ReportError = (field: keyof FormState, msg: string) => void;

interface OrgPanelProps {
  mode: Mode;
  selected: Organization | null;
  saving: boolean;
  onClose: () => void;
  onSave: (form: FormState, reportError: ReportError) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}

function OrgPanel({
  mode,
  selected,
  saving,
  onClose,
  onSave,
  onEdit,
  onCancelEdit,
  onDelete,
}: OrgPanelProps) {
  const [form, setForm] = useState<FormState>(() =>
    mode === "create" ? emptyForm() : selected ? orgToForm(selected) : emptyForm()
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [orgCodeChecking, setOrgCodeChecking] = useState(false);

  useEffect(() => {
    setForm(mode === "create" ? emptyForm() : selected ? orgToForm(selected) : emptyForm());
    setErrors({});
  }, [mode, selected]);

  async function handleOrgCodeBlur() {
    if (mode !== "create" || !form.org_code.trim()) return;
    setOrgCodeChecking(true);
    try {
      const { available } = await checkOrgCode(form.org_code);
      if (!available) {
        setErrors((prev) => ({ ...prev, org_code: "This org code is already taken" }));
      } else {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.org_code;
          return next;
        });
      }
    } catch {
      // silently ignore network errors — server will validate on submit
    } finally {
      setOrgCodeChecking(false);
    }
  }

  function reportError(field: keyof FormState, msg: string) {
    setErrors((prev) => ({ ...prev, [field]: msg }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "Required";
    if (mode === "create" && !form.org_code.trim()) next.org_code = "Required";
    if (!form.contact_person.trim()) next.contact_person = "Required";
    if (!form.plan_selected) next.plan_selected = "Required";
    if (!next.org_code && errors.org_code) next.org_code = errors.org_code;
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
      ? "Add Organization"
      : mode === "edit"
        ? "Edit Organization"
        : (selected?.name ?? "Organization");

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
            placeholder="Acme Corp"
          />
        )}
      </FieldGroup>

      <FieldGroup label="Org Code" error={errors.org_code}>
        {isReadOnly || mode === "edit" ? (
          <p className="text-sm text-fg font-mono py-1">
            {selected?.org_code ?? form.org_code}
          </p>
        ) : (
          <div className="relative">
            <Input
              value={form.org_code}
              onChange={(e) => {
                setForm({ ...form, org_code: e.target.value.toUpperCase() });
                setErrors((prev) => { const n = { ...prev }; delete n.org_code; return n; });
              }}
              onBlur={handleOrgCodeBlur}
              placeholder="ACME"
            />
            {orgCodeChecking && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-muted">
                Checking…
              </span>
            )}
          </div>
        )}
      </FieldGroup>

      <FieldGroup label="Plan" error={errors.plan_selected}>
        {isReadOnly ? (
          <Badge variant="default" className="w-fit">
            {selected?.plan_selected}
          </Badge>
        ) : (
          <select
            value={form.plan_selected}
            onChange={(e) => setForm({ ...form, plan_selected: e.target.value })}
            className="flex h-9 w-full rounded-md border border-border-strong bg-surface px-3 py-1 text-sm text-fg shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring-strong"
          >
            {PLAN_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        )}
      </FieldGroup>

      <FieldGroup label="Contact Person" error={errors.contact_person}>
        {isReadOnly ? (
          <p className="text-sm text-fg py-1">{selected?.contact_person}</p>
        ) : (
          <Input
            value={form.contact_person}
            onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
            placeholder="Jane Smith"
          />
        )}
      </FieldGroup>

      <FieldGroup label="Website">
        {isReadOnly ? (
          <p className="text-sm text-fg py-1">{selected?.website || "—"}</p>
        ) : (
          <Input
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            placeholder="https://example.com"
            type="url"
          />
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
// Organizations page
// ---------------------------------------------------------------------------

export default function Organizations() {
  const [planFilter, setPlanFilter] = useState("");
  const [selected, setSelected] = useState<Organization | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null);

  const { items: orgs, total, page, setPage, search, setSearch, loading, refresh } =
    useEntityList<Organization>({
      fetcher: (params) =>
        listOrganizations({ ...params, ...(planFilter ? { plan: planFilter } : {}) }),
      pageSize: PAGE_SIZE,
    });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handlePlanChange(value: string) {
    setPlanFilter(value);
    setPage(1);
    refresh();
  }

  function openCreate() {
    setSelected(null);
    setMode("create");
    setPanelOpen(true);
  }

  function openView(org: Organization) {
    setSelected(org);
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
        const payload: OrganizationCreate = {
          name: form.name,
          org_code: form.org_code,
          contact_person: form.contact_person,
          plan_selected: form.plan_selected,
          ...(form.website ? { website: form.website } : {}),
          ...(form.phone_number ? { phone_number: form.phone_number } : {}),
        };
        await createOrganization(payload);
        toast({ title: "Organization created." });
      } else if (mode === "edit" && selected) {
        const payload: OrganizationUpdate = {
          name: form.name,
          contact_person: form.contact_person,
          plan_selected: form.plan_selected,
          ...(form.website ? { website: form.website } : {}),
          ...(form.phone_number ? { phone_number: form.phone_number } : {}),
        };
        await updateOrganization(selected.org_id, payload);
        toast({ title: "Organization updated." });
      }
      setPanelOpen(false);
      refresh();
    } catch (err: unknown) {
      if (hasStatus(err, 409)) {
        reportError("org_code", "This org code is already taken");
      } else {
        toast({ variant: "destructive", title: "Failed to save organization." });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteOrganization(deleteTarget.org_id);
      toast({ title: "Organization deleted." });
      setDeleteTarget(null);
      setPanelOpen(false);
      refresh();
    } catch {
      toast({ variant: "destructive", title: "Failed to delete organization." });
    }
  }

  const columns: ColumnDef<Organization>[] = [
    {
      key: "name",
      label: "Name",
      render: (o) => <span className="font-medium">{o.name}</span>,
    },
    {
      key: "org_code",
      label: "Org Code",
      render: (o) => <span className="font-mono text-fg-muted">{o.org_code}</span>,
    },
    {
      key: "plan_selected",
      label: "Plan",
      render: (o) => <Badge variant="muted">{o.plan_selected}</Badge>,
    },
    { key: "contact_person", label: "Contact Person", className: "text-fg-muted" },
    {
      key: "created_on",
      label: "Created",
      render: (o) => (
        <span className="text-fg-muted whitespace-nowrap">{formatDate(o.created_on)}</span>
      ),
    },
  ];

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold m-0">Organizations</h2>
        <Button onClick={openCreate}>Add Organization</Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or code…"
          className="max-w-xs"
        />
        <select
          value={planFilter}
          onChange={(e) => handlePlanChange(e.target.value)}
          className="h-9 rounded-md border border-border-strong bg-surface px-3 text-sm text-fg shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring-strong"
          aria-label="Filter by plan"
        >
          <option value="">Plan: All</option>
          {PLAN_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* Table + pagination */}
      <DataTable
        columns={columns}
        rows={orgs}
        loading={loading}
        getRowKey={(o) => o.org_id}
        onRowClick={openView}
        emptyMessage="No organizations found."
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {/* Side panel */}
      {panelOpen && (
        <OrgPanel
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

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete organization?"
          description={
            <>
              <strong>{deleteTarget.name}</strong> ({deleteTarget.org_code}) will be permanently
              deleted. This action cannot be undone.
            </>
          }
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
