import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/server/db";
import { devLoginEnabled } from "@/server/auth/config";
import { entraEnabled, googleEnabled } from "@/server/auth/edge-config";
import { signIn } from "@/server/auth";

async function signInWithGoogle() {
  "use server";
  await signIn("google", { redirectTo: "/home" });
}

async function signInWithEntra() {
  "use server";
  await signIn("microsoft-entra-id", { redirectTo: "/home" });
}

async function signInWithDevCredentials(formData: FormData) {
  "use server";
  const email = formData.get("email");
  if (typeof email !== "string" || !email) return;
  await signIn("dev-credentials", { email, redirectTo: "/home" });
}

export default async function SignInPage() {
  const devUsers = devLoginEnabled
    ? await db.user.findMany({
        select: { email: true, name: true, role: true, organization: { select: { name: true } } },
        orderBy: [{ organizationId: "asc" }, { role: "asc" }],
      })
    : [];

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Auth.js — Google + Microsoft Entra ID, per-organization SSO.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {googleEnabled && (
          <form action={signInWithGoogle}>
            <Button variant="outline" type="submit" className="w-full">
              Continue with Google
            </Button>
          </form>
        )}
        {entraEnabled && (
          <form action={signInWithEntra}>
            <Button variant="outline" type="submit" className="w-full">
              Continue with Microsoft
            </Button>
          </form>
        )}

        {devLoginEnabled && (
          <form action={signInWithDevCredentials} className="mt-4 flex flex-col gap-2 border-t pt-4">
            <p className="text-muted-foreground text-xs">
              Dev sign-in — local only, never available in production.
            </p>
            <select
              name="email"
              defaultValue=""
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
              required
            >
              <option value="" disabled>
                Choose a seeded user…
              </option>
              {devUsers.map((user) => (
                <option key={user.email} value={user.email}>
                  {user.name} — {user.role}
                  {user.organization ? ` (${user.organization.name})` : " (Platform)"}
                </option>
              ))}
            </select>
            <Button variant="secondary" type="submit" className="w-full">
              Sign in as selected user
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
