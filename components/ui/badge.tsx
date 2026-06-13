import * as React from "react";
import { cn } from "@/lib/utils";

type Tone =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "accent"
  | "info"
  | "muted"
  | "outline";

const tones: Record<Tone, string> = {
  default: "bg-secondary text-secondary-foreground",
  success: "bg-[color:var(--success)]/15 text-[color:var(--success)]",
  warning: "bg-[color:var(--warning)]/15 text-[color:var(--warning)]",
  danger: "bg-[color:var(--destructive)]/15 text-[color:var(--destructive)]",
  // `accent` historically meant a colored highlight (blue) — map to info hue
  // so capability tags stay legible under the neutral shadcn accent token.
  accent: "bg-[color:var(--info)]/15 text-[color:var(--info)]",
  info: "bg-[color:var(--info)]/15 text-[color:var(--info)]",
  muted: "bg-secondary text-muted-foreground",
  outline: "border border-border text-foreground",
};

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
