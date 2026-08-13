import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";
import { TRPCReactProvider } from "@/lib/trpc/client";

import "./globals.css";

export const metadata: Metadata = {
  title: "Desk Booking",
  description: "Role-based workplace desk booking platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <Toaster />
      </body>
    </html>
  );
}
