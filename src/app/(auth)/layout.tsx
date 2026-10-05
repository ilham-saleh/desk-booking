import { BrandMark } from "@/components/layout/brand-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-off-white flex min-h-dvh">
      {/* Brand panel */}
      <aside className="bg-navy relative hidden w-[44%] max-w-[640px] flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark size={40} />
          <span className="flex flex-col leading-tight">
            <span className="text-off-white text-lg font-semibold tracking-[-0.01em]">Third Bridge</span>
            <span className="text-light-blue/80 text-sm font-medium">Desk Booking</span>
          </span>
        </div>
        <div className="relative z-10 max-w-md space-y-4">
          <h1 className="text-light-blue text-[2.75rem] leading-[1.1] font-semibold tracking-[-0.03em]">Your desk, ready when you are.</h1>
          <p className="text-base leading-7 text-white/70">Find and book a workspace in any Third Bridge office, see who&apos;s in, and check in when you arrive.</p>
        </div>
        <p className="text-xs text-white/45">Internal application · Authorised employees only</p>
        {/* The logo's "bridge" bars, enlarged as a quiet backdrop */}
        <div aria-hidden className="absolute -right-10 -bottom-16 flex items-start gap-8 opacity-[0.08]">
          <span className="bg-light-blue h-64 w-16 rounded-b-md" />
          <span className="bg-light-blue h-96 w-16 rounded-b-md" />
          <span className="bg-light-blue h-[30rem] w-16 rounded-b-md" />
        </div>
      </aside>
      <main className="flex flex-1 items-center justify-center p-6">{children}</main>
    </div>
  );
}
