import { CircleCheck, CircleX } from "lucide-react";
import type { ReactNode } from "react";

/** One line of a setup checklist: ✓/✗, a label, and what to know or do about it. */
export function StatusCheck({
  ok,
  label,
  detail,
  children,
}: {
  ok: boolean;
  label: string;
  detail: string;
  children?: ReactNode;
}) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <li className="flex items-start gap-3">
      <Icon
        className={
          ok
            ? "mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            : "text-destructive mt-0.5 size-4 shrink-0"
        }
        aria-hidden
      />
      <div className="flex flex-col gap-1">
        <span className="font-medium">
          {label}
          <span className="sr-only">{ok ? " — OK" : " — needs attention"}</span>
        </span>
        <span className="text-muted-foreground">{detail}</span>
        {children}
      </div>
    </li>
  );
}
