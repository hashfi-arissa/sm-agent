import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "@repo/ui/globals.css";
import { cn } from "@repo/ui/lib/utils";

import { ThemeProvider } from "@/components/theme-provider";

const fontSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fontMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Social Media Agent",
  description: "Draft, structure and schedule your Reels with Codex.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full font-sans antialiased",
        fontSans.variable,
        fontMono.variable,
      )}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
