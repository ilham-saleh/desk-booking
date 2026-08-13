import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignInPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Auth.js (Google + Microsoft Entra ID) arrives in Phase 1.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button variant="outline" disabled>
          Continue with Google
        </Button>
        <Button variant="outline" disabled>
          Continue with Microsoft
        </Button>
      </CardContent>
    </Card>
  );
}
