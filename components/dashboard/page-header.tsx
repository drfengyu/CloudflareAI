import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border px-5 py-8 text-center sm:px-8", className)}>
      <h1 className="font-serif text-2xl font-semibold tracking-[0.02em]">{title}</h1>
      {description && (
        <p className="mx-auto mt-1.5 max-w-2xl text-[13px] font-light text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Placeholder block for routes that are scaffolded but not yet implemented. */
export function Placeholder({ note }: { note: string }) {
  return (
    <div className="m-8 flex h-64 items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-card text-sm text-muted-foreground">
      {note}
    </div>
  );
}
