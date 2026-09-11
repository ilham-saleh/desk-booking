"use client";

import { api } from "@/lib/trpc/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Role } from "@/generated/prisma/enums";

interface UsersListProps {
  onUserSelect?: (userId: string) => void;
}

const roleColors: Record<Role, string> = {
  [Role.PLATFORM_ADMIN]: "bg-red-100 text-red-800",
  [Role.ORG_SUPER_ADMIN]: "bg-purple-100 text-purple-800",
  [Role.SITE_ADMIN]: "bg-blue-100 text-blue-800",
  [Role.BOOKING_MANAGER]: "bg-green-100 text-green-800",
  [Role.STANDARD_USER]: "bg-gray-100 text-gray-800",
};

export function UsersList({ onUserSelect }: UsersListProps) {
  const { data: users, isPending } = api.user.list.useQuery();

  if (isPending) {
    return <div className="p-4">Loading users...</div>;
  }

  return (
    <div className="overflow-x-auto rounded border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Facilities</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users?.map((user) => (
            <TableRow key={user.id} className="hover:bg-gray-50">
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell className="text-sm text-gray-600">{user.email}</TableCell>
              <TableCell className="text-sm">{user.department || "—"}</TableCell>
              <TableCell>
                <Badge className={roleColors[user.role]}>{user.role.replace(/_/g, " ")}</Badge>
              </TableCell>
              <TableCell className="text-sm">{user.permissions?.length ?? 0}</TableCell>
              <TableCell>
                <Badge variant={user.isActive ? "default" : "secondary"}>
                  {user.isActive ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <Button
                  onClick={() => onUserSelect?.(user.id)}
                  variant="ghost"
                  size="sm"
                  className="text-blue-600 hover:text-blue-700"
                >
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
