import { buttonVariants } from "@repo/ui/components/button";
import { Plus } from "lucide-react";
import Link from "next/link";

// Placeholder home until the dashboard lands (M4).
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Social Media Agent
      </h1>
      <p className="text-muted-foreground">
        Draft, structure and schedule your Reels with Codex.
      </p>
      <div className="flex gap-2">
        <Link href="/drafts/new" className={buttonVariants()}>
          <Plus data-icon="inline-start" />
          New draft
        </Link>
        <Link href="/drafts" className={buttonVariants({ variant: "outline" })}>
          All drafts
        </Link>
      </div>
    </main>
  );
}
