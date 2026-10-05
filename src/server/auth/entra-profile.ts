import "server-only";

/**
 * The Entra-owned part of a user, normalised from the ID token claims and
 * (when the lookup succeeds) Microsoft Graph `/me`. Optional fields use
 * `undefined` for "unknown — leave the stored value alone" and `null` for
 * "not set in Entra", so a failed Graph call never wipes a stored department.
 */
export interface EntraProfile {
  objectId: string;
  tenantId: string;
  issuer: string | undefined;
  email: string;
  name: string | undefined;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  department?: string | null;
  location?: string | null;
  phone?: string | null;
  employeeId?: string | null;
}

/** The `/me` properties requested below. Every one may be absent or null in a tenant. */
export interface GraphMe {
  displayName?: string | null;
  givenName?: string | null;
  surname?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  officeLocation?: string | null;
  businessPhones?: string[] | null;
  mobilePhone?: string | null;
  employeeId?: string | null;
}

const GRAPH_ME_URL =
  "https://graph.microsoft.com/v1.0/me?$select=displayName,givenName,surname,mail,userPrincipalName,jobTitle,department,officeLocation,businessPhones,mobilePhone,employeeId";

/**
 * Reads the signed-in user's directory profile with the delegated `User.Read`
 * token Auth.js already requests. Returns null on any failure so sign-in can
 * continue on ID token claims alone.
 */
export async function fetchGraphProfile(accessToken: string): Promise<GraphMe | null> {
  try {
    const response = await fetch(GRAPH_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn("Entra Graph profile lookup failed", { status: response.status });
      return null;
    }
    return (await response.json()) as GraphMe;
  } catch (error) {
    console.warn("Entra Graph profile lookup failed", { error: error instanceof Error ? error.message : error });
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Builds the profile from ID token claims plus an optional Graph result.
 * Returns null when the token lacks what identity matching needs: the object
 * ID, tenant ID and some form of email.
 */
export function toEntraProfile(claims: Record<string, unknown>, graph: GraphMe | null): EntraProfile | null {
  const objectId = text(claims.oid);
  const tenantId = text(claims.tid);
  const email = text(graph?.mail) ?? text(claims.email) ?? text(claims.preferred_username) ?? text(graph?.userPrincipalName);
  if (!objectId || !tenantId || !email) return null;

  // With Graph, a missing attribute really is unset in Entra (null). Without
  // it, only the claims the token happens to carry are known.
  const graphOnly = (value: unknown) => (graph ? text(value) : undefined);
  const graphOrClaim = (graphValue: unknown, claim: unknown) => (graph ? text(graphValue) : (text(claim) ?? undefined));

  return {
    objectId,
    tenantId,
    issuer: text(claims.iss) ?? undefined,
    email: email.toLowerCase(),
    name: text(graph?.displayName) ?? text(claims.name) ?? undefined,
    firstName: graphOrClaim(graph?.givenName, claims.given_name),
    lastName: graphOrClaim(graph?.surname, claims.family_name),
    title: graphOnly(graph?.jobTitle),
    department: graphOnly(graph?.department),
    location: graphOnly(graph?.officeLocation),
    phone: graph ? (text(graph.businessPhones?.[0]) ?? text(graph.mobilePhone)) : undefined,
    employeeId: graphOnly(graph?.employeeId),
  };
}
