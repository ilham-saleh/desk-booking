"use client";

import { useState } from "react";
import { UsersList } from "@/components/admin/users-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminUsersPage() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">Users</h1>
        <p className="mt-2 text-gray-600">Manage user accounts, roles, departments, and facility permissions.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Directory</CardTitle>
          <CardDescription>Search and edit users in your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <UsersList onUserSelect={setSelectedUserId} />
        </CardContent>
      </Card>

      {selectedUserId && (
        <Card>
          <CardHeader>
            <CardTitle>Edit User</CardTitle>
            <CardDescription>User detail form coming in Phase 4.8</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Selected user: {selectedUserId}</p>
            <p className="text-xs text-gray-500 mt-2">Full edit form with role/department/permissions will be implemented next.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
