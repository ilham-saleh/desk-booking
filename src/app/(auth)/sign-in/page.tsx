import { Button } from "@/components/ui/button";
import { fieldClassName } from "@/components/ui/input";
import { BrandMark } from "@/components/layout/brand-mark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/server/db";
import { devLoginEnabled } from "@/server/auth/config";
import { entraEnabled } from "@/server/auth/edge-config";
import { signIn } from "@/server/auth";

async function signInWithEntra() {
  "use server";
  await signIn("microsoft-entra-id", { redirectTo: "/home" });
}

async function signInWithDevCredentials(formData: FormData) {
  "use server";
  const email = formData.get("email");
  if (typeof email !== "string" || !email) return;
  await signIn("dev-credentials", { email, redirect: true, redirectTo: "/home" });
}

const SIGN_OUT_NOTICES: Record<string, string> = {
  inactive:
    "Your previous session belonged to an account that no longer exists or has been deactivated. Please sign in again.",
};

/** Auth.js error codes it appends when it redirects a failed sign-in here (pages.error). */
const SIGN_IN_ERRORS: Record<string, string> = {
  AccessDenied:
    "We couldn't sign you in with that Microsoft account. Use your company work account. If your access has been removed, contact your workplace admin.",
};
const GENERIC_SIGN_IN_ERROR = "Sign-in didn't complete. Please try again.";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; error?: string }>;
}) {
  const { reason, error } = await searchParams;
  const notice = error ? (SIGN_IN_ERRORS[error] ?? GENERIC_SIGN_IN_ERROR) : reason ? SIGN_OUT_NOTICES[reason] : undefined;
  const devUsers = devLoginEnabled
    ? await db.user.findMany({
        select: { id: true, email: true, name: true, role: true, organization: { select: { name: true } } },
        orderBy: [{ organizationId: "asc" }, { role: "asc" }],
      })
    : [];

  return (
    <Card className="w-full max-w-[400px] gap-6 py-8 shadow-md">
      <CardHeader className="gap-3 px-8">
        <BrandMark size={44} className="lg:hidden" />
        <div className="space-y-1.5">
          <CardTitle className="text-navy text-2xl leading-8 tracking-[-0.02em]">Sign in</CardTitle>
          <CardDescription className="text-sm">
            Use your Third Bridge work account to continue.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 px-8">
        {notice && (
          <p
            role="status"
            className="bg-warning-soft rounded-xl border border-[#f5d2b3] p-3 text-sm leading-5 text-[#6b3608]"
          >
            {notice}
          </p>
        )}
        {!entraEnabled && !devLoginEnabled && (
          <p role="alert" className="text-muted-foreground text-sm">
            Microsoft sign-in isn&apos;t configured yet. Contact your workplace admin.
          </p>
        )}
        {entraEnabled && (
          <form action={signInWithEntra}>
            <Button variant="default" size="lg" type="submit" className="w-full">
              Continue with Microsoft
            </Button>
          </form>
        )}

        {devLoginEnabled && (
          <form
            action={signInWithDevCredentials}
            className="mt-3 flex flex-col gap-2.5 border-t pt-5"
          >
            <p className="text-muted-foreground text-xs">
              Dev sign-in — local only, never available in production.
            </p>
            <select
              name="email"
              defaultValue=""
              aria-label="Seeded user"
              className={fieldClassName}
              required
            >
              <option value="" disabled>
                Choose a seeded user…
              </option>
              {devUsers.map((user) => (
                <option key={user.id} value={user.email}>
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
