import { UserDetails } from "@/components/admin/users/user-details";

export default async function AdminUserDetailsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <UserDetails userId={userId} />;
}
