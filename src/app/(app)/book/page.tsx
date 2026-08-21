import { auth } from "@/server/auth";
import { BookADeskView } from "@/components/booking/book-a-desk-view";

export default async function BookPage() {
  const session = await auth();
  return <BookADeskView currentUserRole={session!.user.role} />;
}
