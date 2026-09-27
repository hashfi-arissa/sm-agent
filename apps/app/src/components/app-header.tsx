"use client";

import { cn } from "@repo/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/drafts", label: "Drafts" },
  { href: "/contents", label: "Contents" },
  { href: "/calendar", label: "Calendar" },
  { href: "/search", label: "Search" },
  { href: "/connect", label: "Codex" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="bg-background/95 sticky top-0 z-40 h-14 shrink-0 border-b backdrop-blur">
      <div className="flex h-full items-center gap-6 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          Social Media Agent
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "hover:bg-muted rounded-md px-2.5 py-1.5 transition-colors",
                  active
                    ? "text-foreground font-medium"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
