# Desk Booking System — Spec Addendum v2.2 (Multi-Tenant SaaS)

*Supersedes v2.1 and supplements `docs/spec-v2.md`. Where documents differ, the newest wins.*

**Target changed:** this is now a **multi-tenant SaaS** ("OfficeSpace-style") that hosts
multiple, isolated customer companies — not a single-company internal tool. Build the
multi-tenant machinery; do not defer it. Recommended go-to-market: ship for one company first
("customer zero") through Phase 5, then add the SaaS platform layer (Phases 7–8) before
onboarding external customers.

---

## 1. Multi-tenancy (full)

**Organization = tenant = a customer company.** Every tenant-owned entity is scoped to an
organization: User, Site (+ Floors/Desks/Rooms/Utilities), Booking, DeskWatch, Notification,
Permission, AuditLog, and floor-plan files.

**Hard isolation requirement:** every query and mutation is scoped by `organizationId`, enforced
centrally (e.g. Prisma middleware / a tenant-scoped client), never left to individual call
sites. Organization A must never be able to read or affect Organization B's data. This must be
covered by automated tests.

**Role hierarchy (revised for SaaS):**
- **Platform Admin** — operator of the SaaS. Creates/suspends organizations, oversees the
  platform. Belongs to no customer org. (New.)
- **Org Super Admin** — top admin *within one customer company*: all its sites, users, roles,
  site permissions, and SSO settings.
- **Site Admin** — facility admin scoped to assigned site(s) within their org; can view the
  org-wide user directory but manages desks/floors only for their sites.
- **Standard User** — books desks, manages own bookings.

**Organization entity:** id, name, status (active/suspended/trial), plan/settings, SSO
configuration (per-org), branding (optional), timestamps.

**Onboarding/provisioning:** creating an organization provisions its first Org Super Admin and
an empty tenant (no sites/desks yet). Self-service or Platform-Admin-driven.

**Data model count:** v2's 13 entities + **Organization** = **14**, plus `organizationId`
foreign keys on all tenant-owned entities.

---

## 2. Authentication & SSO (multi-tenant)

**Principle unchanged:** SSO authenticates; the org's `User` table is the directory (dummy
data now; HRIS Google-Sheet sync later, per-org). Reject sign-in for emails not provisioned in
that organization.

**Per-organization SSO — the SaaS difference:** each customer company connects **their own**
identity provider. Support:
- **Entra ID:** either a multi-tenant Entra app (customers grant admin consent for their
  tenant) or per-org stored config (each org records its own tenant/client details).
- **Google Workspace:** per-org allowed domain(s).

On sign-in, the user must be resolved to the correct organization — by email domain mapping,
by which org's SSO connection they authenticated through, or by an org-selection step. Store
SSO settings on the Organization, never hard-coded.

**Env vars** hold the *platform's* base auth secrets and the multi-tenant app credentials;
per-org details live in the database (encrypted where sensitive). Never commit credentials.

**Local/testing:** seed one org ("customer zero") with the developer's email so real SSO can
be exercised once configured.

---

## 3. Floor-plan uploads & sample files (unchanged from v2.1)

Admins upload a floor-plan PDF/image that becomes a floor's map background; desks/rooms/
utilities are placed on top. Files are **tenant-scoped** and stored on the app's file storage
(see §4 for where that lives in a SaaS). PDFs are rendered first-page-to-PNG for the canvas.

**Sample files (provided):** `docs/floorplans/Floor-2.pdf`, `Floor-4.pdf`, `Floor-5.pdf`.
- **Phase 2:** seed these (rasterized, with placed desks) under customer-zero so booking has
  real maps.
- **Phase 4:** admin upload UI + PDF→image conversion + placement + draft/live.

---

## 4. SaaS implications (hosting, security, compliance)

The single-VPS ~$25/month plan is **no longer appropriate** once external customers' data is
hosted. Plan for:

- **Managed, scalable infrastructure:** managed Postgres with automated point-in-time backups,
  container hosting that can scale, a CDN, and a proper secrets manager. Revisit the *managed*
  cost plan (~$200+/month baseline) — cost now scales with customers, not a fixed internal bill.
- **Availability:** customers expect uptime; design for no single point of failure and consider
  an SLA.
- **Tenant isolation & security:** central org-scoping, security review/pen testing, least-
  privilege access, encrypted secrets, audit logging across tenants.
- **Compliance:** as a **GDPR data processor** for customers you need Data Processing Agreements
  per customer, a clear retention/erasure model per tenant, and — for enterprise sales — a path
  to **SOC 2**. Budget effort for this, not just infrastructure.
- **File storage:** tenant-scoped object storage (S3-compatible) is the natural choice at SaaS
  scale rather than a single local volume; keep a storage abstraction so this is swappable.

These are product/security/compliance investments, not line items — treat them as first-class
scope.

---

## 5. Revised build phases

- **Phases 0–5:** build the tenant-aware app and ship it working for **customer zero** (one
  org). Scaffold → data+auth (with Organization + roles) → core booking → check-in → admin →
  notifications/watch/analytics. Isolation enforced from the schema up, even with one tenant.
- **Phase 6 (optional/deferred):** per-org HRIS Google-Sheet sync; optional AI assistant.
- **Phase 7 — SaaS platform layer:** Platform Admin, organization onboarding/provisioning,
  per-org SSO configuration, and the tenant-isolation test suite.
- **Phase 8 — SaaS readiness:** move to managed/scalable hosting, monitoring, per-tenant
  backups, billing (if commercial), and compliance groundwork (DPAs, SOC 2 prep).

Build and review one phase at a time; open a PR per phase.
