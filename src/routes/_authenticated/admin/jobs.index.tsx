import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, StatusBadge } from "@/components/site";
import { brandTitle } from "@/lib/data";
import { ALL_STATUSES, SOURCE_LABELS, STATUS_LABELS, STATUS_LABELS_ES, type SourceType } from "@/lib/pricing";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/jobs/")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Admin · Jobs") }] }),
  component: AdminJobs,
});

const SOURCE_LABELS_ES: Record<SourceType, string> = {
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  youtube: "YouTube",
  instagram_reel: "Instagram Reel",
  upload: "Video subido",
};

function AdminJobs() {
  const { t, lang } = useI18n();
  const statusLabels = lang === "es" ? STATUS_LABELS_ES : STATUS_LABELS;
  const sourceLabels = lang === "es" ? SOURCE_LABELS_ES : SOURCE_LABELS;
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [client, setClient] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const clients = useQuery({ queryKey: ["admin-profiles"], queryFn: async () => (await supabase.from("profiles").select("id,full_name,email,company").order("created_at")).data ?? [] });
  const jobs = useQuery({
    queryKey: ["admin-jobs", status, source, client, from, to, q],
    queryFn: async () => {
      let r = supabase.from("jobs").select("id,code,status,source_type,subject_name,user_id,created_at,try_number").order("created_at", { ascending: false }).limit(500);
      if (status !== "all") r = r.eq("status", status);
      if (source !== "all") r = r.eq("source_type", source);
      if (client !== "all") r = r.eq("user_id", client);
      if (from) r = r.gte("created_at", new Date(from).toISOString());
      if (to) r = r.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      if (q.trim()) r = r.or(`code.ilike.%${q.trim()}%,subject_name.ilike.%${q.trim()}%`);
      return (await r).data ?? [];
    },
  });
  const name = (id: string) => { const c = clients.data?.find((x) => x.id === id); return c?.company || c?.full_name || c?.email || "—"; };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("Jobs", "Trabajos")}</h1>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Input placeholder={t("Search code or subject", "Buscar código o sujeto")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("All statuses", "Todos los estados")}</SelectItem>{ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}</SelectContent></Select>
        <Select value={source} onValueChange={setSource}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("All sources", "Todas las fuentes")}</SelectItem>{Object.entries(sourceLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={client} onValueChange={setClient}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("All clients", "Todos los clientes")}</SelectItem>{clients.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.company || c.full_name || c.email}</SelectItem>)}</SelectContent></Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("From date", "Fecha desde")} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("To date", "Fecha hasta")} />
      </div>
      {jobs.isLoading ? <Skeleton className="h-64" /> : jobs.data!.length === 0 ? <Empty title={t("No jobs match", "Ningún trabajo coincide")} /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table><TableHeader><TableRow><TableHead>{t("Code", "Código")}</TableHead><TableHead>{t("Client", "Cliente")}</TableHead><TableHead>{t("Subject", "Sujeto")}</TableHead><TableHead>{t("Source", "Fuente")}</TableHead><TableHead>{t("Try", "Intento")}</TableHead><TableHead>{t("Created", "Creado")}</TableHead><TableHead>{t("Status", "Estado")}</TableHead></TableRow></TableHeader>
            <TableBody>{jobs.data!.map((j) => (
              <TableRow key={j.id} className="cursor-pointer">
                <TableCell><Link to="/admin/jobs/$jobId" params={{ jobId: j.id }} className="font-medium text-primary">{j.code}</Link></TableCell>
                <TableCell>{name(j.user_id)}</TableCell><TableCell>{j.subject_name}</TableCell><TableCell>{sourceLabels[j.source_type as SourceType]}</TableCell><TableCell>{j.try_number}</TableCell>
                <TableCell>{format(new Date(j.created_at), "MMM d, HH:mm", { locale: lang === "es" ? es : undefined })}</TableCell><TableCell><StatusBadge status={j.status} /></TableCell>
              </TableRow>
            ))}</TableBody></Table>
        </div>
      )}
    </div>
  );
}
