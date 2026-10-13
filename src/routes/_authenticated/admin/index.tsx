import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { addHours, formatDistanceToNow } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, StatusBadge } from "@/components/site";
import { brandTitle } from "@/lib/data";
import { ALL_STATUSES, STATUS_LABELS, STATUS_LABELS_ES } from "@/lib/pricing";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Admin") }] }),
  component: Overview,
});

function Overview() {
  const { t, lang } = useI18n();
  const jobs = useQuery({ queryKey: ["admin-jobs-all"], queryFn: async () => (await supabase.from("jobs").select("id,code,status,created_at,estimated_turnaround_hours,subject_name")).data ?? [] });
  const pending = useQuery({ queryKey: ["admin-cr-pending-count"], queryFn: async () => (await supabase.from("credit_requests").select("id", { count: "exact", head: true }).eq("status", "pending")).count ?? 0 });
  const failed = useQuery({ queryKey: ["spoofer-failed"], queryFn: async () => (await supabase.from("spoofer_sync").select("job_id").eq("state", "failed")).data ?? [] });
  if (jobs.isLoading) return <Skeleton className="h-64" />;
  const statusLabels = lang === "es" ? STATUS_LABELS_ES : STATUS_LABELS;
  const counts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  jobs.data!.forEach((j) => (counts[j.status] = (counts[j.status] ?? 0) + 1));
  const open = jobs.data!.filter((j) => !["delivered", "cancelled"].includes(j.status))
    .map((j) => ({ ...j, due: addHours(new Date(j.created_at), j.estimated_turnaround_hours) }))
    .sort((a, b) => a.due.getTime() - b.due.getTime()).slice(0, 10);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("Overview", "Resumen")}</h1>
      {(failed.data?.length ?? 0) > 0 && (
        <Card className="border-destructive"><CardContent className="space-y-1 pt-6 text-sm">
          <p className="font-medium text-destructive">{t("Spoofer sync failed for these jobs — open one and press Retry now:", "Falló la sincronización con Spoofer en estos pedidos — abre uno y pulsa Reintentar ahora:")}</p>
          {failed.data!.map((f) => <Link key={f.job_id} to="/admin/jobs/$jobId" params={{ jobId: f.job_id }} className="mr-3 underline">{jobs.data!.find((j) => j.id === f.job_id)?.code ?? f.job_id}</Link>)}
        </CardContent></Card>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link to="/admin/credit-requests"><Card className="bg-hero-glow"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{t("Pending credit requests", "Solicitudes de créditos pendientes")}</p><p className="font-display text-3xl font-semibold">{pending.data ?? "…"}</p></CardContent></Card></Link>
        {ALL_STATUSES.map((s) => (
          <Card key={s}><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{statusLabels[s]}</p><p className="font-display text-3xl font-semibold">{counts[s]}</p></CardContent></Card>
        ))}
      </div>
      <Card><CardHeader><CardTitle>{t("Due soon", "Por vencer")}</CardTitle></CardHeader><CardContent>
        {open.length === 0 ? <Empty title={t("No open jobs", "No hay trabajos abiertos")} /> : <div className="divide-y divide-border">{open.map((j) => (
          <Link key={j.id} to="/admin/jobs/$jobId" params={{ jobId: j.id }} className="flex items-center justify-between py-3 hover:bg-accent/40">
            <div><p className="font-medium">{j.code} · {j.subject_name}</p><p className={`text-sm ${j.due < new Date() ? "text-destructive" : "text-muted-foreground"}`}>{j.due < new Date() ? t("Overdue ", "Vencido ") : t("Due ", "Vence ")}{formatDistanceToNow(j.due, { addSuffix: true, locale: lang === "es" ? es : enUS })}</p></div>
            <StatusBadge status={j.status} />
          </Link>
        ))}</div>}
      </CardContent></Card>
    </div>
  );
}
