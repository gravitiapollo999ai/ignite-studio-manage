import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowLeft, Download, ExternalLink, FileJson, Lock, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, StatusBadge } from "@/components/site";
import { JobTimeline } from "@/components/job-timeline";
import { brandTitle, errMsg, signedUrl } from "@/lib/data";
import { ALL_STATUSES, SOURCE_LABELS, STATUS_LABELS, STATUS_LABELS_ES, formatMmSs, type SourceType } from "@/lib/pricing";
import { useI18n } from "@/lib/i18n";
import { SpooferSyncCard } from "@/components/spoofer-sync-card";
import { DraftPromptButton } from "@/components/ai-helper";

export const Route = createFileRoute("/_authenticated/admin/jobs/$jobId")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Admin · Job") }] }),
  component: AdminJob,
});

const SOURCE_LABELS_ES: Record<SourceType, string> = {
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  youtube: "YouTube",
  instagram_reel: "Instagram Reel",
  upload: "Video subido",
};

function AdminJob() {
  const { t, lang } = useI18n();
  const dateLocale = lang === "es" ? es : undefined;
  const statusLabels = lang === "es" ? STATUS_LABELS_ES : STATUS_LABELS;
  const sourceLabels = lang === "es" ? SOURCE_LABELS_ES : SOURCE_LABELS;
  const { jobId } = Route.useParams();
  const qc = useQueryClient();
  const job = useQuery({ queryKey: ["admin-job", jobId], queryFn: async () => (await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle()).data });
  const client = useQuery({ enabled: !!job.data, queryKey: ["admin-profile", job.data?.user_id], queryFn: async () => (await supabase.from("profiles").select("*").eq("id", job.data!.user_id).maybeSingle()).data });
  const internal = useQuery({ queryKey: ["job-internal", jobId], queryFn: async () => (await supabase.from("job_internal").select("*").eq("job_id", jobId).maybeSingle()).data });
  const events = useQuery({ queryKey: ["admin-events", jobId], queryFn: async () => (await supabase.from("job_events").select("*").eq("job_id", jobId).order("created_at")).data ?? [] });
  const files = useQuery({ queryKey: ["admin-deliv", jobId], queryFn: async () => (await supabase.from("deliverables").select("*").eq("job_id", jobId).order("created_at", { ascending: false })).data ?? [] });
  const refImg = useQuery({ enabled: !!job.data?.reference_image_path, queryKey: ["ref-img", jobId], queryFn: () => signedUrl("reference-images", job.data!.reference_image_path!, 3600) });

  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [inotes, setInotes] = useState("");
  const [uploadTry, setUploadTry] = useState("1");
  const [refund, setRefund] = useState("1");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (job.data) { setStatus(job.data.status); setUploadTry(String(job.data.try_number)); } }, [job.data]);
  useEffect(() => { setPrompt(internal.data?.internal_prompt ?? ""); setInotes(internal.data?.internal_notes ?? ""); }, [internal.data]);

  if (job.isLoading) return <Skeleton className="h-96" />;
  const j = job.data;
  if (!j) return <Empty title={t("Job not found", "Trabajo no encontrado")} />;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-job", jobId] }); qc.invalidateQueries({ queryKey: ["admin-events", jobId] }); };

  async function updateStatus() {
    setBusy("status");
    const { error } = await supabase.rpc("set_job_status", { _job_id: j!.id, _status: status, _message: message.trim() });
    setBusy(null);
    if (error) return toast.error(errMsg(error));
    toast.success(t(`Status set to ${STATUS_LABELS[status as keyof typeof STATUS_LABELS]}`, `Estado cambiado a ${STATUS_LABELS_ES[status as keyof typeof STATUS_LABELS_ES]}`));
    setMessage(""); refresh();
  }
  async function saveInternal() {
    setBusy("internal");
    const { error } = await supabase.from("job_internal").upsert({ job_id: j!.id, internal_prompt: prompt, internal_notes: inotes });
    setBusy(null);
    if (error) return toast.error(errMsg(error));
    toast.success(t("Internal prompt saved", "Prompt interno guardado"));
    qc.invalidateQueries({ queryKey: ["job-internal", jobId] });
  }
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy("upload");
    try {
      for (const f of Array.from(list)) {
        const path = `${j!.id}/try${uploadTry}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
        const up = await supabase.storage.from("deliverables").upload(path, f, f.type ? { contentType: f.type } : {});
        if (up.error) throw up.error;
        const { error } = await supabase.from("deliverables").insert({ job_id: j!.id, file_path: path, file_name: f.name, try_number: Number(uploadTry) });
        if (error) throw error;
      }
      toast.success(t(`${list.length} file(s) uploaded`, `${list.length} archivo(s) subido(s)`));
      qc.invalidateQueries({ queryKey: ["admin-deliv", jobId] });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  }
  async function removeFile(id: string, path: string) {
    await supabase.storage.from("deliverables").remove([path]);
    const { error } = await supabase.from("deliverables").delete().eq("id", id);
    if (error) return toast.error(errMsg(error));
    toast.success(t("File removed", "Archivo eliminado"));
    qc.invalidateQueries({ queryKey: ["admin-deliv", jobId] });
  }
  async function doRefund() {
    const n = Number(refund);
    if (!Number.isInteger(n) || n <= 0) return toast.error(t("Enter a positive whole number", "Ingresa un número entero positivo"));
    if (!confirm(t(`Refund ${n} credit(s) to the client?`, `¿Reembolsar ${n} crédito(s) al cliente?`))) return;
    const { error } = await supabase.rpc("refund_job", { _job_id: j!.id, _credits: n, _note: `Refund for ${j!.code}` });
    if (error) return toast.error(errMsg(error));
    toast.success(t("Credits refunded", "Créditos reembolsados"));
  }
  async function open(bucket: string, path: string) {
    try { window.open(await signedUrl(bucket, path, 3600), "_blank", "noopener"); } catch (e) { toast.error(errMsg(e)); }
  }
  async function handoffJson() {
    try {
      const payload = {
        job_id: j!.id, code: j!.code, status: j!.status, try_number: j!.try_number,
        source_type: j!.source_type, source_url: j!.source_url,
        source_file_url: j!.source_file_path ? await signedUrl("source-videos", j!.source_file_path, 86400) : null,
        source_file_path: j!.source_file_path, clip_start: j!.clip_start, clip_end: j!.clip_end,
        target_duration_seconds: j!.target_duration_seconds, resolution: "1080p",
        subject_type: j!.subject_type, subject_name: j!.subject_name, business_type: j!.business_type,
        reference_image_url: j!.reference_image_path ? await signedUrl("reference-images", j!.reference_image_path, 86400) : null,
        reference_image_path: j!.reference_image_path, notes: j!.notes,
        internal_prompt: prompt || null, created_at: j!.created_at,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${j!.code}-handoff.json`; a.click();
      toast.success(t("Handoff file downloaded (links valid 24h)", "Archivo de traspaso descargado (enlaces válidos por 24h)"));
    } catch (e) { toast.error(errMsg(e)); }
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/jobs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />{t("All jobs", "Todos los trabajos")}</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{j.code}</h1><p className="text-sm text-muted-foreground">{client.data ? <Link to="/admin/clients/$clientId" params={{ clientId: j.user_id }} className="text-primary">{client.data.company || client.data.full_name || client.data.email}</Link> : "…"} · {format(new Date(j.created_at), "MMM d, yyyy HH:mm", { locale: dateLocale as any })} · {t("Try", "Intento")} {j.try_number}</p></div>
        <StatusBadge status={j.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SpooferSyncCard jobId={jobId} />
          <Card className="border-primary/40">
            <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>{t("Production handoff", "Traspaso a producción")}</CardTitle><Button size="sm" variant="outline" onClick={handoffJson}><FileJson className="h-4 w-4" />{t("Download handoff JSON", "Descargar JSON de traspaso")}</Button></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <div>
                  {refImg.data ? <a href={refImg.data} target="_blank" rel="noreferrer"><img src={refImg.data} alt={t("Subject reference", "Referencia del sujeto")} className="aspect-square w-full rounded-lg border border-border object-cover" /></a> : <Skeleton className="aspect-square w-full" />}
                  <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => open("reference-images", j.reference_image_path!)} disabled={!j.reference_image_path}><Download className="h-4 w-4" />{t("Reference image", "Imagen de referencia")}</Button>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <D k={t("Source", "Fuente")} v={sourceLabels[j.source_type as SourceType]} />
                  <D k={t("Length", "Duración")} v={`${j.target_duration_seconds}s · 1080p`} />
                  {(j.clip_start != null || j.clip_end != null) && <D k={t("Clip", "Clip")} v={`${formatMmSs(j.clip_start) || "0:00"} – ${formatMmSs(j.clip_end) || t("end", "fin")}`} />}
                  <D k={t("Subject", "Sujeto")} v={`${j.subject_name} (${j.subject_type})`} />
                  <D k={t("Business", "Negocio")} v={j.business_type ?? "—"} />
                  <D k={t("Turnaround", "Tiempo de entrega")} v={`${j.estimated_turnaround_hours}h`} />
                  <div className="col-span-2">
                    {j.source_url && <a href={j.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-primary"><ExternalLink className="h-4 w-4" />{j.source_url}</a>}
                    {j.source_file_path && <Button size="sm" variant="outline" onClick={() => open("source-videos", j.source_file_path!)}><Download className="h-4 w-4" />{t("Open source video", "Abrir video fuente")}</Button>}
                  </div>
                  {j.notes && <div className="col-span-2"><dt className="text-muted-foreground">{t("Client notes", "Notas del cliente")}</dt><dd className="whitespace-pre-wrap">{j.notes}</dd></div>}
                </dl>
              </div>
            </CardContent>
          </Card>

          <Card className="border-warning/60">
            <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4" />{t("Internal – never shown to client", "Interno – nunca visible para el cliente")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2"><Label>{t("Internal prompt", "Prompt interno")}</Label><Textarea rows={10} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="font-mono text-sm" /><DraftPromptButton jobId={j.id} onResult={(x) => setPrompt((p) => (p ? `${p}\n\n${x}` : x))} /></div>
              <div className="space-y-2"><Label>{t("Internal notes", "Notas internas")}</Label><Textarea rows={3} value={inotes} onChange={(e) => setInotes(e.target.value)} /></div>
              <Button onClick={saveInternal} disabled={busy === "internal"}>{busy === "internal" ? t("Saving…", "Guardando…") : t("Save internal", "Guardar interno")}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("Deliverables", "Entregables")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1"><Label>{t("Try", "Intento")}</Label><Select value={uploadTry} onValueChange={setUploadTry}><SelectTrigger className="w-24"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem></SelectContent></Select></div>
                <Label htmlFor="dl" className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground"><Upload className="h-4 w-4" />{busy === "upload" ? t("Uploading…", "Subiendo…") : t("Upload files", "Subir archivos")}</Label>
                <input id="dl" type="file" multiple className="sr-only" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} disabled={busy === "upload"} />
              </div>
              {files.data?.length === 0 ? <Empty title={t("No deliverables yet", "Aún no hay entregables")} /> : <div className="divide-y divide-border">{files.data?.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-2 text-sm"><span>{f.file_name} <span className="text-muted-foreground">· {t("try", "intento")} {f.try_number}</span></span>
                  <span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => open("deliverables", f.file_path)}>{t("Open", "Abrir")}</Button><Button size="sm" variant="ghost" onClick={() => removeFile(f.id, f.file_path)}>{t("Remove", "Eliminar")}</Button></span></div>
              ))}</div>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card><CardHeader><CardTitle>{t("Update status", "Actualizar estado")}</CardTitle></CardHeader><CardContent className="space-y-3">
            <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}</SelectContent></Select>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("Message to client (visible to client)", "Mensaje para el cliente (visible para el cliente)")} maxLength={1000} />
            <Button className="w-full" onClick={updateStatus} disabled={busy === "status" || status === j.status}>{busy === "status" ? t("Saving…", "Guardando…") : t("Update status", "Actualizar estado")}</Button>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>{t("Refund credits", "Reembolsar créditos")}</CardTitle></CardHeader><CardContent className="flex gap-2">
            <Input type="number" min={1} value={refund} onChange={(e) => setRefund(e.target.value)} className="w-24" /><Button variant="outline" onClick={doRefund}>{t("Refund", "Reembolsar")}</Button>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>{t("Timeline", "Cronología")}</CardTitle></CardHeader><CardContent>
            <JobTimeline status={j.status} tryNumber={j.try_number} maxTries={2} events={events.data ?? []} />
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}

function D({ k, v }: { k: string; v: string }) {
  return <div><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>;
}
