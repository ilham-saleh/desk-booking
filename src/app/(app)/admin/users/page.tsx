import { UsersDirectory } from "@/components/admin/users/users-directory";

/**
 * Users — the combined employee directory + role/permission administration
 * area (PROJECT_SPECS.md §39–43). Access is enforced by the /admin proxy and
 * layout; every mutation re-checks the actor server-side.
 */
export default function AdminUsersPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
      <div>
        <h1 className="type-page-title">Users</h1>
        <p className="text-muted-foreground mt-1 max-w-[70ch] text-sm leading-6">
          Employee directory with application roles and site permissions. Employees appear here after their first Microsoft sign-in; their profile details update from Entra each time they sign in.
        </p>
      </div>
      <UsersDirectory />
    </div>
  );
}
