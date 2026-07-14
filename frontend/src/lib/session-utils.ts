import type { JwtClaims, Organization } from "@/types/api";
import { getOrganization, listOrganizations } from "@/services/api";

export interface NavLink {
  to: string;
  label: string;
  ariaLabel: string;
}

export function isSuperAdmin(claims: JwtClaims | null): boolean {
  return claims?.role === "Super Admin";
}

const _BASE_NAV_LINKS: NavLink[] = [
  { to: "/step1", label: "Step 1 · Strategy", ariaLabel: "Go to Step 1 — Strategy" },
  { to: "/step2", label: "Step 2 · Compare & Generate", ariaLabel: "Go to Step 2 — Compare and Generate" },
  { to: "/history", label: "History", ariaLabel: "Go to History" },
  { to: "/roles", label: "Roles", ariaLabel: "Go to Roles" },
  { to: "/users", label: "Users", ariaLabel: "Go to Users" },
];

const _ORG_NAV_LINK: NavLink = {
  to: "/organizations",
  label: "Organizations",
  ariaLabel: "Go to Organizations",
};

export function buildNavLinks(claims: JwtClaims | null): NavLink[] {
  const links = [..._BASE_NAV_LINKS];
  if (isSuperAdmin(claims)) {
    // Insert Organizations after History (index 2)
    links.splice(3, 0, _ORG_NAV_LINK);
  }
  return links;
}

export function buildOrgsFetcher(
  claims: JwtClaims | null
): () => Promise<Organization[]> {
  if (isSuperAdmin(claims)) {
    return () => listOrganizations({ page_size: 100 }).then((res) => res.items);
  }
  if (claims?.org_id) {
    const orgId = claims.org_id;
    return () => getOrganization(orgId).then((org) => [org]);
  }
  return () => Promise.resolve([]);
}
