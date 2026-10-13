import { Link, rootRouteId, useLoaderData } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";
import { DEFAULT_SETTINGS, settingsQuery } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type JobStatus } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export function useSettings() {
  const root = useLoaderData({ from: rootRouteId }) as { settings?: typeof DEFAULT_SETTINGS } | undefined;
  const { data } = useQuery({ ...settingsQuery, initialData: root?.settings });
  return data ?? DEFAULT_SETTINGS;
}

export function BrandMark({ className }: { className?: string }) {
  const s = useSettings();
  return (
    <Link to="/" className={cn("flex items-center gap-2 font-display text-lg font-semibold", className)}>
      {s.logo_url ? (
        <img src={s.logo_url} alt={s.brand_name} className="h-8 w-auto max-w-[140px] object-contain" />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Clapperboard className="h-4 w-4" />
        </span>
      )}
      <span>{s.brand_name}</span>
    </Link>
  );
}

export function SiteFooter() {
  const s = useSettings();
  return (
    <footer className="border-t border-border py-8 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 sm:flex-row">
        <span>© {new Date().getFullYear()} {s.brand_name}. All rights reserved.</span>
        <a href={`mailto:${s.support_email}`} className="hover:text-foreground">{s.support_email}</a>
      </div>
    </footer>
  );
}

const STATUS_TONE: Record<JobStatus, string> = {
  submitted: "bg-secondary text-secondary-foreground",
  in_review: "bg-accent text-accent-foreground",
  prompt_ready: "bg-accent text-accent-foreground",
  generating: "bg-primary/15 text-primary",
  qa: "bg-warning/20 text-foreground",
  delivered: "bg-success/20 text-foreground",
  revision: "bg-warning/25 text-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

export function StatusBadge({ status }: { status: string }) {
  const s = status as JobStatus;
  return <Badge variant="outline" className={cn("border-transparent", STATUS_TONE[s])}>{STATUS_LABELS[s] ?? status}</Badge>;
}

export function RequestBadge({ status }: { status: string }) {
  const tone = status === "approved" ? "bg-success/20" : status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-warning/20";
  return <Badge variant="outline" className={cn("border-transparent capitalize text-foreground", tone)}>{status}</Badge>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
