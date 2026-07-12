import axios from "axios";

import type {
  FeedbackRequest,
  GenerateResult,
  HistoryItem,
  NotebookResult,
  Organization,
  OrganizationCreate,
  OrganizationListResponse,
  OrganizationUpdate,
  PipelineParams,
  PipelineRecommendation,
  ProviderCatalog,
  ProviderRecommendation,
  Role,
  RoleCreate,
  RoleListResponse,
  RoleUpdate,
  Selections,
  TokenResponse,
  UploadResult,
  User,
  UserCreate,
  UserListResponse,
  UserUpdate,
} from "@/types/api";

const STORAGE_KEY = "rag-builder.auth.token";

const client = axios.create({ baseURL: "/api" });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response?.status === 401 &&
      !err.config?.url?.startsWith("/auth/")
    ) {
      localStorage.removeItem(STORAGE_KEY);
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export type UploadProgressCallback = (progress: number) => void;

export async function uploadDocument(
  file: File,
  onProgress?: UploadProgressCallback
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await client.post<UploadResult>("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: onProgress
      ? (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percent);
          }
        }
      : undefined,
  });
  // End-to-end integration check: log the raw /api/upload response.
  console.log("[upload] /api/upload response:", data);
  return data;
}

/**
 * Get an LLM-driven pipeline recommendation for an uploaded document.
 *
 * Called straight after `/upload` using the `doc_id` from its response. The
 * backend tries Azure OpenAI first and transparently falls back to the local
 * rules engine (reflected in `source`), so this never hard-fails on LLM issues.
 */
export async function recommendPipeline(
  docId: string,
  documentType?: string,
  forceFresh?: boolean
): Promise<PipelineRecommendation> {
  const { data } = await client.post<PipelineRecommendation>("/recommend", {
    doc_id: docId,
    ...(documentType ? { document_type: documentType } : {}),
    ...(forceFresh ? { force_fresh: true } : {}),
  });
  return data;
}

export async function recommendProviders(
  docId: string,
  forceFresh?: boolean
): Promise<ProviderRecommendation> {
  const { data } = await client.post<ProviderRecommendation>(
    "/recommend-providers",
    { doc_id: docId, ...(forceFresh ? { force_fresh: true } : {}) }
  );
  return data;
}

export async function submitFeedback(payload: FeedbackRequest): Promise<void> {
  await client.post("/feedback", payload);
}

export async function getFeedback(
  recommendationId: string,
  phase: 1 | 2
): Promise<number | null> {
  const { data } = await client.get<{ rating: number | null }>(
    `/feedback/${recommendationId}`,
    { params: { phase } }
  );
  return data.rating;
}

export async function fetchProviders(): Promise<ProviderCatalog> {
  const { data } = await client.get<ProviderCatalog>("/providers");
  return data;
}

export async function generateCode(
  selections: Selections,
  params?: PipelineParams
): Promise<GenerateResult> {
  const { data } = await client.post<GenerateResult>("/generate", {
    selections,
    ...(params ? { params } : {}),
  });
  return data;
}

export async function fetchHistory(): Promise<HistoryItem[]> {
  const response = await client.get<{ items: HistoryItem[] }>("/history");
  return response.data.items;
}

export async function listOrganizations(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  plan?: string;
}): Promise<OrganizationListResponse> {
  const { data } = await client.get<OrganizationListResponse>("/organizations", {
    params,
  });
  return data;
}

export async function createOrganization(
  data: OrganizationCreate
): Promise<Organization> {
  const { data: org } = await client.post<Organization>("/organizations", data);
  return org;
}

export async function getOrganization(id: string): Promise<Organization> {
  const { data } = await client.get<Organization>(`/organizations/${id}`);
  return data;
}

export async function updateOrganization(
  id: string,
  data: OrganizationUpdate
): Promise<Organization> {
  const { data: org } = await client.put<Organization>(
    `/organizations/${id}`,
    data
  );
  return org;
}

export async function deleteOrganization(id: string): Promise<void> {
  await client.delete(`/organizations/${id}`);
}

export async function checkOrgCode(
  orgCode: string
): Promise<{ available: boolean }> {
  const { data } = await client.get<{ available: boolean }>(
    "/organizations/check-org-code",
    { params: { org_code: orgCode } }
  );
  return data;
}

export async function listUsers(params?: {
  page?: number;
  page_size?: number;
  search?: string;
}): Promise<UserListResponse> {
  const { data } = await client.get<UserListResponse>("/users", { params });
  return data;
}

export async function createUser(data: UserCreate): Promise<User> {
  const { data: user } = await client.post<User>("/users", data);
  return user;
}

export async function getUser(id: string): Promise<User> {
  const { data } = await client.get<User>(`/users/${id}`);
  return data;
}

export async function updateUser(id: string, data: UserUpdate): Promise<User> {
  const { data: user } = await client.put<User>(`/users/${id}`, data);
  return user;
}

export async function deleteUser(id: string): Promise<void> {
  await client.delete(`/users/${id}`);
}

export async function checkEmail(
  email: string
): Promise<{ available: boolean }> {
  const { data } = await client.get<{ available: boolean }>(
    "/users/check-email",
    { params: { email } }
  );
  return data;
}

export async function listRoles(params?: {
  page?: number;
  page_size?: number;
  search?: string;
}): Promise<RoleListResponse> {
  const { data } = await client.get<RoleListResponse>("/roles", { params });
  return data;
}

export async function getRole(id: string): Promise<Role> {
  const { data } = await client.get<Role>(`/roles/${id}`);
  return data;
}

export async function createRole(data: RoleCreate): Promise<Role> {
  const { data: role } = await client.post<Role>("/roles", data);
  return role;
}

export async function updateRole(id: string, data: RoleUpdate): Promise<Role> {
  const { data: role } = await client.put<Role>(`/roles/${id}`, data);
  return role;
}

export async function deleteRole(id: string): Promise<void> {
  await client.delete(`/roles/${id}`);
}

export async function checkRoleName(
  name: string
): Promise<{ available: boolean }> {
  const { data } = await client.get<{ available: boolean }>(
    "/roles/check-name",
    { params: { name } }
  );
  return data;
}

export async function generateNotebook(
  selections: Selections,
  params?: PipelineParams
): Promise<void> {
  const { data } = await client.post<NotebookResult>("/generate-notebook", {
    selections,
    ...(params ? { params } : {}),
  });
  const blob = new Blob([JSON.stringify(data.notebook, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = data.filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function loginStep1(
  email: string,
  orgCode: string
): Promise<{ message: string; masked_phone: string }> {
  const { data } = await client.post("/auth/login", {
    email,
    org_code: orgCode,
  });
  return data;
}

export async function verifyOtp(
  email: string,
  orgCode: string,
  otp: string
): Promise<TokenResponse> {
  const { data } = await client.post<TokenResponse>("/auth/verify-otp", {
    email,
    org_code: orgCode,
    otp,
  });
  return data;
}
