import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { AppAuthProvider } from "@/components/auth/auth-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/app/globals.css";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading"
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "BuildOS Infra",
  description: "Infrastructure control plane for BuildOS.",
  applicationName: "BuildOS Infra",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BuildOS"
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#020617"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${headingFont.variable} ${monoFont.variable}`}>
      <body className="font-[family-name:var(--font-heading)] antialiased">
        <AppAuthProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </AppAuthProvider>
        <Toaster theme="dark" position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
