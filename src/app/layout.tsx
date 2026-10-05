import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { TRPCReactProvider } from "@/lib/trpc/client";

import "./globals.css";

// Third Bridge's own site sets Inter as its primary typeface.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Desk Booking · Third Bridge",
  description: "Role-based workplace desk booking platform",
  icons: { icon: "/brand/third-bridge-mark.jpeg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <Toaster />
      </body>
    </html>
  );
}
