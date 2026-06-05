import type { ReactNode } from "react";

type WorkspaceBrand = {
  name: string;
  logo_url: string | null;
  primary_color: string | null;
};

// White-label header for the client-facing dashboard: the client's logo (or a
// primary-colour swatch) + name, an optional subtitle, and optional nav.
export function ClientHeader({
  workspace,
  subtitle,
  children,
}: {
  workspace: WorkspaceBrand;
  subtitle?: string;
  children?: ReactNode;
}) {
  const color = workspace.primary_color ?? "#6366f1";
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
      <div className="flex items-center gap-3">
        {workspace.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={workspace.logo_url}
            alt=""
            className="h-9 w-9 rounded-md object-contain"
          />
        ) : (
          <span
            className="h-9 w-9 shrink-0 rounded-md"
            style={{ backgroundColor: color }}
          />
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {workspace.name}
          </h1>
          {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {children && <nav className="flex gap-2 text-sm">{children}</nav>}
    </header>
  );
}
