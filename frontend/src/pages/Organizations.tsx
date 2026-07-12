import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    // preserve async org_code error (e.g. from blur check) if field still has that value
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

        <div className="flex flex-col gap-4 px-6 py-5 flex-1">
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
                onChange={(e) =>
                  setForm({ ...form, plan_selected: e.target.value })
                }
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
                onChange={(e) =>
                  setForm({ ...form, contact_person: e.target.value })
                }
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
                onChange={(e) =>
                  setForm({ ...form, phone_number: e.target.value })
                }
                placeholder="+1 555 000 0000"
                type="tel"
              />
            )}
          </FieldGroup>

          {mode === "view" && selected && (
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
                <Button type="button" onClick={onEdit} className="flex-1">
                  Edit
                </Button>
                <Button type="button" variant="destructive" onClick={onDelete}>
                  Delete
                </Button>
              </>
            ) : mode === "edit" ? (
              <>
                <Button type="button" disabled={saving} onClick={handleSubmit} className="flex-1">
                  {saving ? "Updating…" : "Update"}
                </Button>
                <Button type="button" variant="secondary" onClick={onCancelEdit}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button type="button" disabled={saving} onClick={handleSubmit} className="flex-1">
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
  org: Organization;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirm({ org, onConfirm, onCancel }: DeleteConfirmProps) {
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
          Delete organization?
        </h3>
        <p className="text-sm text-fg-muted mb-5">
          <strong>{org.name}</strong> ({org.org_code}) will be permanently
          deleted. This action cannot be undone.
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
// Organizations page
// ---------------------------------------------------------------------------

export default function Organizations() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Organization | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Debounce search input → also resets page to 1
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
    listOrganizations({
      page,
      page_size: PAGE_SIZE,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(planFilter ? { plan: planFilter } : {}),
    })
      .then((res) => {
        if (cancelled) return;
        setOrgs(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        if (cancelled) return;
        toast({
          variant: "destructive",
          title: "Failed to load organizations.",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, planFilter, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, total);

  function handlePlanChange(value: string) {
    setPlanFilter(value);
    setPage(1);
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
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      if (hasStatus(err, 409)) {
        reportError("org_code", "This org code is already taken");
      } else {
        toast({
          variant: "destructive",
          title: "Failed to save organization.",
        });
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
      setRefreshKey((k) => k + 1);
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to delete organization.",
      });
    }
  }

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

      {/* Table */}
      <div className="overflow-x-auto bg-surface border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Org Code</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Contact Person</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <SkeletonRows />}

            {!loading && orgs.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-12 text-fg-muted"
                >
                  No organizations found.
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              orgs.map((org) => (
                <TableRow
                  key={org.org_id}
                  className="cursor-pointer"
                  onClick={() => openView(org)}
                >
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell className="font-mono text-fg-muted">
                    {org.org_code}
                  </TableCell>
                  <TableCell>
                    <Badge variant="muted">{org.plan_selected}</Badge>
                  </TableCell>
                  <TableCell className="text-fg-muted">
                    {org.contact_person}
                  </TableCell>
                  <TableCell className="text-fg-muted whitespace-nowrap">
                    {formatDate(org.created_on)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
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
        <DeleteConfirm
          org={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
