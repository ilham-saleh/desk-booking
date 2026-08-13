import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PhasePlaceholder({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">Built in {phase}.</p>
      </CardContent>
    </Card>
  );
}
