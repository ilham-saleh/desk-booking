import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { TrpcPingBadge } from "@/components/layout/trpc-ping-badge";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-4">
      <TrpcPingBadge />
      <PhasePlaceholder
        title="Home"
        phase="Phase 2 (Core booking)"
        description="Greeting, quick Book a Desk / My Bookings actions, and an embedded floor-map preview."
      />
    </div>
  );
}
