import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, StatusBadge } from "@/components/site";
import { brandTitle } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { ALL_STATUSES, SOURCE_LABELS, STATUS_LABELS, STATUS_LABELS_ES, type SourceType } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/jobs/")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Your videos") }] }),
  component: JobsList,
});

const SOURCE_LABELS_ES: Record<SourceType, string> = {
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  youtube: "YouTube",
  instagram_reel: "Reel de Instagram",
  upload: "MP4 subido",
};

function JobsList() {
  const { t, lang } = useI18n();
  const dateLocale = lang === "es" ? { locale: es } : undefined;
  const sourceLabels = lang === "es" ? SOURCE_LABELS_ES : SOURCE_LABELS;
  const statusLabels = lang === "es" ? STATUS_LABELS_ES : STATUS_LABELS;
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const jobs = useQuery({
    queryKey: ["my-jobs", status, q],
    queryFn: async () => {
      let qry = supabase.from("jobs").select("id,code,status,subject_name,source_type,created_at,try_number").order("created_at", { ascending: false });
      if (status !== "all") qry = qry.eq("status", status);
      if (q.trim()) qry = qry.ilike("code", `%${q.trim()}%`);
      return (await qry).data ?? [];
    },
  });
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{t("Your videos", "Tus videos")}</h1><Button asChild><Link to="/jobs/new"><Plus className="h-4 w-4" />{t("New video", "Nuevo video")}</Link></Button></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input placeholder={t("Search by code (JOB-000123)", "Buscar por código (JOB-000123)")} value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("All statuses", "Todos los estados")}</SelectItem>{ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}</SelectContent></Select>
      </div>
      {jobs.isLoading ? <Skeleton className="h-40" /> : jobs.data!.length === 0 ? <Empty title={t("No videos found", "No se encontraron videos")} /> : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {jobs.data!.map((j) => (
            <Link key={j.id} to="/jobs/$jobId" params={{ jobId: j.id }} className="flex items-center justify-between gap-3 p-4 hover:bg-accent/40">
              <div className="min-w-0"><p className="font-medium">{j.code}</p><p className="truncate text-sm text-muted-foreground">{j.subject_name} · {sourceLabels[j.source_type as SourceType]} · {format(new Date(j.created_at), "MMM d", dateLocale)}</p></div>
              <StatusBadge status={j.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
