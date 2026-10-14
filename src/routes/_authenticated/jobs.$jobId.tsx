import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, StatusBadge, useSettings } from "@/components/site";
import { JobTimeline } from "@/components/job-timeline";
import { PrivateVideoPlayer } from "@/components/private-video-player";
import { brandTitle, errMsg, signedUrl } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { SOURCE_LABELS, formatMmSs, type SourceType } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Video details") }] }),
  component: JobDetail,
});

const SOURCE_LABELS_ES: Record<SourceType, string> = {
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  youtube: "YouTube",
  instagram_reel: "Reel de Instagram",
  upload: "MP4 subido",
};

function JobDetail() {
  const { jobId } = Route.useParams();
  const { t, lang } = useI18n();
  const dateLocale = lang === "es" ? { locale: es } : undefined;
  const sourceLabels = lang === "es" ? SOURCE_LABELS_ES : SOURCE_LABELS;
  const s = useSettings();
  const qc = useQueryClient();
  const job = useQuery({ queryKey: ["job", jobId], queryFn: async () => (await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle()).data });
  const events = useQuery({ queryKey: ["job-events", jobId], queryFn: async () => (await supabase.from("job_events").select("id,status,message,created_at").eq("job_id", jobId).order("created_at")).data ?? [] });
  const files = useQuery({ queryKey: ["deliverables", jobId], queryFn: async () => (await supabase.from("deliverables").select("*").eq("job_id", jobId).order("created_at", { ascending: false })).data ?? [] });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (job.isLoading) return <Skeleton className="h-96" />;
  const j = job.data;
  if (!j) return <Empty title={t("Video not found", "Video no encontrado")}><Link to="/jobs" className="text-primary">{t("Back to videos", "Volver a videos")}</Link></Empty>;

  async function download(path: string, name: string) {
    try { const u = await signedUrl("deliverables", path, 600); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  async function revise() {
    if (!reason.trim()) return toast.error(t("Tell us what to change", "Dinos qué debemos cambiar"));
    setBusy(true);
    const { error } = await supabase.rpc("request_revision", { _job_id: j!.id, _reason: reason.trim().slice(0, 1000) });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success(t("Revision requested", "Revisión solicitada"));
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["job", jobId] });
    qc.invalidateQueries({ queryKey: ["job-events", jobId] });
  }
  const canRevise = j.status === "delivered" && j.try_number < Math.min(2, s.max_tries_per_video);

  return (
    <div className="space-y-6">
      <Link to="/jobs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />{t("All videos", "Todos los videos")}</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{j.code}</h1><p className="text-sm text-muted-foreground">{t("Ordered", "Solicitado el")} {format(new Date(j.created_at), "MMM d, yyyy", dateLocale)}</p></div>
        <StatusBadge status={j.status} />
      </div>
      <Card><CardHeader><CardTitle>{t("Progress", "Progreso")}</CardTitle></CardHeader><CardContent>
        <JobTimeline status={j.status} tryNumber={j.try_number} maxTries={Math.min(2, s.max_tries_per_video)} events={events.data ?? []} />
      </CardContent></Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>{t("Your videos", "Tus videos")}</CardTitle>{canRevise && <Button variant="outline" size="sm" onClick={() => setOpen(true)}>{t("Request revision", "Solicitar revisión")}</Button>}</CardHeader>
        <CardContent>
          {files.data?.length === 0 ? <Empty title={t("Not ready yet", "Aún no está listo")}>{t("Your finished videos will appear here.", "Tus videos terminados aparecerán aquí.")}</Empty> : (
            <div className="divide-y divide-border">{files.data?.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="space-y-2">{/\.(mp4|mov|webm)$/i.test(f.file_name) && <PrivateVideoPlayer path={f.file_path} />}<p className="font-medium">{f.file_name}</p><p className="text-xs text-muted-foreground">{t("Try", "Intento")} {f.try_number} · {format(new Date(f.created_at), "MMM d", dateLocale)}</p></div>
                <div className="flex flex-wrap justify-end gap-2"><Button size="sm" onClick={() => download(f.file_path, f.file_name)}><Download className="h-4 w-4" />{t("Download", "Descargar")}</Button>
                  <Button size="sm" variant="outline" disabled title={t("Coming soon", "Próximamente")}>{t("Post to TikTok · Coming soon", "Publicar en TikTok · Próximamente")}</Button>
                  <Button size="sm" variant="outline" disabled title={t("Coming soon", "Próximamente")}>{t("Post to Instagram · Coming soon", "Publicar en Instagram · Próximamente")}</Button></div></div>
            ))}</div>
          )}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>{t("Order details", "Detalles del pedido")}</CardTitle></CardHeader><CardContent>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row k={t("Source", "Fuente")} v={sourceLabels[j.source_type as SourceType]} />
          {j.source_url && <Row k={t("Link", "Enlace")} v={<a href={j.source_url} target="_blank" rel="noreferrer" className="break-all text-primary">{j.source_url}</a>} />}
          {(j.clip_start != null || j.clip_end != null) && <Row k={t("Clip", "Clip")} v={`${formatMmSs(j.clip_start) || "0:00"} – ${formatMmSs(j.clip_end) || t("end", "fin")}`} />}
          <Row k={t("Length", "Duración")} v={`${j.target_duration_seconds}s · 1080p`} />
          <Row k={t("Subject", "Sujeto")} v={`${j.subject_name} (${j.subject_type})`} />
          <Row k={t("Business type", "Tipo de negocio")} v={j.business_type ?? "—"} />
          <Row k={t("Credits", "Créditos")} v={String(j.estimated_credits)} />
          <Row k={t("Turnaround", "Tiempo de entrega")} v={`${j.estimated_turnaround_hours}h`} />
          {j.notes && <div className="sm:col-span-2"><dt className="text-muted-foreground">{t("Notes", "Notas")}</dt><dd className="whitespace-pre-wrap">{j.notes}</dd></div>}
        </dl>
      </CardContent></Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>{t("Request revision (try 2 of 2)", "Solicitar revisión (intento 2 de 2)")}</DialogTitle></DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("What should we change?", "¿Qué debemos cambiar?")} maxLength={1000} />
          <DialogFooter><Button onClick={revise} disabled={busy}>{busy ? t("Sending…", "Enviando…") : t("Request revision", "Solicitar revisión")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>;
}
