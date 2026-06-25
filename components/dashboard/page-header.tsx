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
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-border px-8 py-5",
        className,
      )}
    >
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
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
