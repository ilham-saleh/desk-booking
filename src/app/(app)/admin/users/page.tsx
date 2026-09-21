import { UsersDirectory } from "@/components/admin/users/users-directory";

/**
 * Users — the combined employee directory + role/permission administration
 * area (PROJECT_SPECS.md §39–43). Access is enforced by the /admin proxy and
 * layout; every mutation re-checks the actor server-side.
 */
export default function AdminUsersPage() {
  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">Users</h1>
        <p className="mt-2 text-gray-600">
          Employee directory with application roles and site permissions. Employee details will be kept in sync from the HRIS data sheet.
        </p>
      </div>
      <UsersDirectory />
    </div>
  );
}
