"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { buttonVariants } from "@repo/ui/components/button";
import { LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ensureOk } from "@/lib/fetch-client";

export function ImportBackupForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      setError(null);
      setPending(file);
    }
  }

  async function restore() {
    if (!pending) return;
    setRestoring(true);
    setError(null);
    try {
      const text = await pending.text();
      const body = JSON.parse(text);
      await ensureOk(
        await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      setPending(null);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? "Not a valid backup file"
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setRestoring(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={onPick}
      />
      <button
        type="button"
        className={buttonVariants({ variant: "outline" })}
        onClick={() => inputRef.current?.click()}
      >
        <Upload data-icon="inline-start" />
        Restore from backup…
      </button>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore from backup?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pending?.name}&rdquo; replaces every draft, content and
              schedule entry currently stored. This can&apos;t be undone —
              export a fresh backup first if you want to keep what&apos;s here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={restore}
              disabled={restoring}
            >
              {restoring && (
                <LoaderCircle
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
