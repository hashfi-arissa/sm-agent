import { Button } from "@repo/ui/components/button";

// Placeholder home until M1 — replaced by the Connect Codex screen in M0 step 3.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Social Media Agent
      </h1>
      <p className="text-muted-foreground">
        Draft, structure and schedule your Reels with Codex.
      </p>
      <Button disabled>Connect Codex (coming in M0)</Button>
    </main>
  );
}
