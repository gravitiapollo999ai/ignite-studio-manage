import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Check, ImagePlus, Link2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { useSettings } from "@/components/site";
import { balanceQuery, brandTitle, errMsg } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { BUSINESS_TYPES, BUSINESS_TYPES_ES, SOURCE_LABELS, defaultDuration, detectPlatform, formatMmSs, jobCost, parseMmSs, type SourceType } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { dispatchJobSync } from "@/lib/spoofer.functions";
import { verifySourceVideo } from "@/lib/source-video.functions";
import { isSourceTooLong } from "@/lib/mp4-duration";
import { LIMIT_30_EN, LIMIT_30_ES } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/jobs/new")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "New video") }] }),
  component: NewJob,
});

const SOURCE_LABELS_ES: Record<SourceType, string> = {
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  youtube: "YouTube",
  instagram_reel: "Reel de Instagram",
  upload: "MP4 subido",
};

const SUBJECT_TYPE_LABELS: Record<"person" | "product" | "business", { en: string; es: string }> = {
  person: { en: "person", es: "persona" },
  product: { en: "product", es: "producto" },
  business: { en: "business", es: "negocio" },
};

function NewJob() {
  const { user } = Route.useRouteContext();
  const { t, lang } = useI18n();
  const sourceLabels = lang === "es" ? SOURCE_LABELS_ES : SOURCE_LABELS;
  const STEPS = [t("Source", "Fuente"), t("Subject", "Sujeto"), t("Review", "Revisión")];
  const s = useSettings();
  const nav = useNavigate();
  const qc = useQueryClient();
  const dispatchSync = useServerFn(dispatchJobSync);
  const verifyVideo = useServerFn(verifySourceVideo);
  const limitMsg = t(LIMIT_30_EN, LIMIT_30_ES);
  const bal = useQuery(balanceQuery(user.id));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  // source
  const [mode, setMode] = useState<"link" | "upload">("link");
  const [url, setUrl] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileDur, setFileDur] = useState<number | null>(null);
  const platform = mode === "link" ? detectPlatform(url) : null;

  // subject
  const [subjectType, setSubjectType] = useState<"person" | "product" | "business">("person");
  const [subjectName, setSubjectName] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [bizType, setBizType] = useState("");
  const [bizOther, setBizOther] = useState("");
  const [notes, setNotes] = useState("");

  // review
  const clipLen = mode === "upload" ? fileDur : platform === "youtube" ? (() => { const a = parseMmSs(start), b = parseMmSs(end); return a != null && b != null && b > a ? b - a : null; })() : null;
  const [duration, setDuration] = useState<number>(15);
  useEffect(() => { setDuration(defaultDuration(clipLen, s.max_video_seconds)); }, [clipLen, s.max_video_seconds]);

  useEffect(() => { if (!image) return setPreview(null); const u = URL.createObjectURL(image); setPreview(u); return () => URL.revokeObjectURL(u); }, [image]);

  function onVideo(f: File | null) {
    setFileDur(null);
    if (!f) return setFile(null);
    if (f.type !== "video/mp4") return toast.error(t("Please upload an MP4 file", "Por favor sube un archivo MP4"));
    if (f.size > 500 * 1024 * 1024) return toast.error(t("Max file size is 500 MB", "El tamaño máximo del archivo es 500 MB"));
    setFile(f);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      // Friendly preflight only; the server re-measures the uploaded file before the order is accepted.
      if (isSourceTooLong(v.duration)) { setFile(null); toast.error(limitMsg); return; }
      setFileDur(Math.min(30, Math.round(v.duration)));
    };
    v.src = URL.createObjectURL(f);
  }
  function onImage(f: File | null) {
    if (!f) return setImage(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return toast.error(t("Use JPG, PNG or WebP", "Usa JPG, PNG o WebP"));
    if (f.size > 20 * 1024 * 1024) return toast.error(t("Max image size is 20 MB", "El tamaño máximo de la imagen es 20 MB"));
    setImage(f);
  }

  function validateSource() {
    if (mode === "link") {
      if (!platform) { toast.error(t("Paste a TikTok, YouTube Shorts, YouTube or Instagram Reel link", "Pega un enlace de TikTok, YouTube Shorts, YouTube o Reel de Instagram")); return false; }
      if (platform === "youtube") {
        if ((start && parseMmSs(start) == null) || (end && parseMmSs(end) == null)) { toast.error(t("Use mm:ss for start and end", "Usa mm:ss para inicio y fin")); return false; }
        const a = parseMmSs(start), b = parseMmSs(end);
        if (a == null || b == null) { toast.error(t("For regular YouTube videos, enter a start and end of 30 seconds or less.", "Para videos normales de YouTube, indica un inicio y un final de 30 segundos o menos.")); return false; }
        if (b <= a) { toast.error(t("End must be after start", "El final debe ser después del inicio")); return false; }
        if (b - a > 30) { toast.error(limitMsg); return false; }
      }
    } else if (!file) { toast.error(t("Upload an MP4 video", "Sube un video MP4")); return false; }
    else if (fileDur == null) { toast.error(t("Still reading the video length… try again in a moment.", "Aún leyendo la duración del video… inténtalo en un momento.")); return false; }
    return true;
  }
  function validateSubject() {
    const r = z.object({ name: z.string().trim().min(1, t("Enter the subject name", "Ingresa el nombre del sujeto")).max(120) }).safeParse({ name: subjectName });
    if (!r.success) { toast.error(r.error.issues[0].message); return false; }
    if (!image) { toast.error(t("Upload a reference image of the subject", "Sube una imagen de referencia del sujeto")); return false; }
    if (!bizType) { toast.error(t("Choose a business type", "Elige un tipo de negocio")); return false; }
    if (bizType === "Other" && !bizOther.trim()) { toast.error(t("Describe your business type", "Describe tu tipo de negocio")); return false; }
    if (notes.length > 2000) { toast.error(t("Notes are too long", "Las notas son demasiado largas")); return false; }
    return true;
  }

  const cost = s.credits_per_video;
  const balance = bal.data ?? 0;
  const enough = balance >= cost;

  async function confirm() {
    try { jobCost(s.credits_per_video, duration, s.max_video_seconds); } catch (e) { return toast.error(errMsg(e)); }
    if (!enough) return toast.error(t("Not enough credits", "No tienes créditos suficientes"));
    setBusy(true);
    try {
      let sourcePath: string | null = null;
      if (mode === "upload" && file) {
        setProgress(t("Uploading video…", "Subiendo video…"));
        sourcePath = `${user.id}/${crypto.randomUUID()}.mp4`;
        const { error } = await supabase.storage.from("source-videos").upload(sourcePath, file, { contentType: "video/mp4" });
        if (error) throw error;
        setProgress(t("Checking video length…", "Verificando la duración del video…"));
        const v = await verifyVideo({ data: { path: sourcePath } });
        if (!v.ok) {
          setBusy(false); setProgress(null);
          return toast.error(v.reason === "too_long" ? limitMsg : t("We couldn't read your video's length. Please upload a standard MP4 again.", "No pudimos leer la duración de tu video. Vuelve a subir un MP4 estándar."));
        }
      }
      setProgress(t("Uploading reference image…", "Subiendo imagen de referencia…"));
      const ext = image!.name.split(".").pop()?.toLowerCase() || "jpg";
      const imgPath = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("reference-images").upload(imgPath, image!, { contentType: image!.type });
      if (up.error) throw up.error;
      setProgress(t("Creating your order…", "Creando tu pedido…"));
      const { data, error } = await supabase.rpc("create_job", {
        _source_type: (mode === "upload" ? "upload" : platform) as string,
        _source_url: mode === "link" ? url.trim() : "",
        _source_file_path: sourcePath as string,
        _clip_start: (platform === "youtube" ? parseMmSs(start) : null) as number,
        _clip_end: (platform === "youtube" ? parseMmSs(end) : null) as number,
        _target_duration_seconds: duration,
        _subject_type: subjectType,
        _subject_name: subjectName.trim(),
        _business_type: bizType === "Other" ? `Other: ${bizOther.trim()}` : bizType,
        _reference_image_path: imgPath,
        _notes: notes.trim(),
      });
      if (error) throw error;
      // Fire-and-forget production sync; failures are retried and flagged for admins, never shown to clients.
      dispatchSync({ data: { jobId: data as string } }).catch(() => {});
      toast.success(t("Video ordered! We're on it.", "¡Video solicitado! Ya estamos en ello."));
      qc.invalidateQueries();
      nav({ to: "/jobs/$jobId", params: { jobId: data as string } });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); setProgress(null); }
  }

  const durationOptions = [10, 15, 20, 30].filter((d) => d <= s.max_video_seconds);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t("New video", "Nuevo video")}</h1>
      <ol className="flex items-center gap-2">
        {STEPS.map((lbl, i) => (
          <li key={lbl} className="flex flex-1 items-center gap-2">
            <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold", i < step ? "border-primary bg-primary text-primary-foreground" : i === step ? "border-primary text-primary" : "border-border text-muted-foreground")}>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
            <span className={cn("text-sm", i === step ? "font-medium" : "text-muted-foreground")}>{lbl}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      <Card><CardContent className="space-y-5 pt-6">
        {step === 0 && (
          <Tabs value={mode} onValueChange={(v) => setMode(v as "link" | "upload")}>
            <p className="mb-3 rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">{limitMsg}</p>
            <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="link"><Link2 className="h-4 w-4" />{t("Paste link", "Pegar enlace")}</TabsTrigger><TabsTrigger value="upload"><Upload className="h-4 w-4" />{t("Upload MP4", "Subir MP4")}</TabsTrigger></TabsList>
            <TabsContent value="link" className="space-y-4 pt-4">
              <div className="space-y-2"><Label htmlFor="url">{t("Video link", "Enlace del video")}</Label><Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@…" />
                {url && <p className={cn("text-sm", platform ? "text-success" : "text-destructive")}>{platform ? t(`Detected: ${sourceLabels[platform]}`, `Detectado: ${sourceLabels[platform]}`) : t("Unsupported link — use TikTok, YouTube Shorts, YouTube or Instagram Reels", "Enlace no compatible — usa TikTok, YouTube Shorts, YouTube o Reels de Instagram")}</p>}
              </div>
              {platform === "youtube" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>{t("Start (mm:ss)", "Inicio (mm:ss)")}</Label><Input value={start} onChange={(e) => setStart(e.target.value)} placeholder="0:00" /></div>
                  <div className="space-y-2"><Label>{t("End (mm:ss)", "Fin (mm:ss)")}</Label><Input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="0:30" /></div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="upload" className="space-y-3 pt-4">
              <Label htmlFor="vid" className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center hover:bg-accent/40">
                <Upload className="h-6 w-6 text-primary" />
                <span className="text-sm">{file ? file.name : t("Choose an MP4 (max 500 MB)", "Elige un MP4 (máx. 500 MB)")}</span>
                {fileDur != null && <span className="text-xs text-muted-foreground">{t("Length:", "Duración:")} {formatMmSs(fileDur)}</span>}
              </Label>
              <input id="vid" type="file" accept="video/mp4" className="sr-only" onChange={(e) => onVideo(e.target.files?.[0] ?? null)} />
            </TabsContent>
          </Tabs>
        )}

        {step === 1 && (
          <>
            <div className="space-y-2"><Label>{t("What should star in the video?", "¿Qué debería protagonizar el video?")}</Label>
              <RadioGroup value={subjectType} onValueChange={(v) => setSubjectType(v as typeof subjectType)} className="grid grid-cols-3 gap-2">
                {(["person", "product", "business"] as const).map((ty) => (
                  <Label key={ty} className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 capitalize", subjectType === ty ? "border-primary bg-accent" : "border-border")}><RadioGroupItem value={ty} className="sr-only" />{lang === "es" ? SUBJECT_TYPE_LABELS[ty].es : SUBJECT_TYPE_LABELS[ty].en}</Label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-2"><Label htmlFor="sn">{t("Subject name", "Nombre del sujeto")}</Label><Input id="sn" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder={subjectType === "person" ? t("e.g. Maria, our head chef", "ej. María, nuestra chef principal") : subjectType === "product" ? t("e.g. Signature burger", "ej. Hamburguesa de la casa") : t("e.g. Blue Bay Realty", "ej. Inmobiliaria Bahía Azul")} /></div>
            <div className="space-y-2"><Label>{t("Reference image", "Imagen de referencia")}</Label>
              <Label htmlFor="img" className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-border p-4 hover:bg-accent/40">
                {preview ? <img src={preview} alt={t("Reference preview", "Vista previa de referencia")} className="h-20 w-20 rounded-lg object-cover" /> : <span className="grid h-20 w-20 place-items-center rounded-lg bg-muted"><ImagePlus className="h-6 w-6 text-muted-foreground" /></span>}
                <span className="text-sm text-muted-foreground">{image ? image.name : t("Clear photo of the subject — JPG, PNG or WebP, max 20 MB", "Foto clara del sujeto — JPG, PNG o WebP, máx. 20 MB")}</span>
              </Label>
              <input id="img" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onImage(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-2"><Label>{t("Business type", "Tipo de negocio")}</Label>
              <Select value={bizType} onValueChange={setBizType}><SelectTrigger><SelectValue placeholder={t("Choose…", "Elige…")} /></SelectTrigger><SelectContent>{BUSINESS_TYPES.map((b) => <SelectItem key={b} value={b}>{t(b, BUSINESS_TYPES_ES[b] ?? b)}</SelectItem>)}</SelectContent></Select>
              {bizType === "Other" && <Input value={bizOther} onChange={(e) => setBizOther(e.target.value)} placeholder={t("Describe your business", "Describe tu negocio")} maxLength={100} />}
            </div>
            <div className="space-y-2"><Label htmlFor="notes">{t("Notes", "Notas")}</Label><Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder={t("Text on screen, offers, tone, what to change from the original…", "Texto en pantalla, ofertas, tono, qué cambiar del original…")} /></div>
          </>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("Target duration", "Duración deseada")}</Label>
              {clipLen ? (
                <div className="flex items-center gap-3"><Input type="number" min={1} max={s.max_video_seconds} value={duration} onChange={(e) => setDuration(Math.max(1, Math.min(s.max_video_seconds, Number(e.target.value) || 1)))} className="w-28" /><span className="text-sm text-muted-foreground">{t(`seconds (clip is ${formatMmSs(clipLen)}, max ${s.max_video_seconds}s)`, `segundos (el clip dura ${formatMmSs(clipLen)}, máx. ${s.max_video_seconds}s)`)}</span></div>
              ) : (
                <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{durationOptions.map((d) => <SelectItem key={d} value={String(d)}>{t(`${d} seconds`, `${d} segundos`)}</SelectItem>)}</SelectContent></Select>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-secondary p-4 text-sm">
              <dt className="text-muted-foreground">{t("Estimated cost", "Costo estimado")}</dt><dd className="text-right font-medium">{t(`${cost} credit`, `${cost} crédito`)}</dd>
              <dt className="col-span-2 -mt-2 text-xs text-muted-foreground">{t(`1 credit per video (up to ${s.max_video_seconds}s, 1080p)`, `1 crédito por video (hasta ${s.max_video_seconds}s, 1080p)`)}</dt>
              <dt className="text-muted-foreground">{t("Estimated turnaround", "Tiempo de entrega estimado")}</dt><dd className="text-right font-medium">{t(`${s.default_turnaround_hours} hours`, `${s.default_turnaround_hours} horas`)}</dd>
              <dt className="text-muted-foreground">{t("Current balance", "Saldo actual")}</dt><dd className="text-right font-medium">{balance}</dd>
              <dt className="text-muted-foreground">{t("Balance after", "Saldo después")}</dt><dd className={cn("text-right font-medium", !enough && "text-destructive")}>{balance - cost}</dd>
            </dl>
            <p className="text-sm text-muted-foreground">{t(`Includes up to ${s.max_tries_per_video} tries per video.`, `Incluye hasta ${s.max_tries_per_video} intentos por video.`)}</p>
            {!enough && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t("You don't have enough credits.", "No tienes créditos suficientes.")} <Link to="/credits" className="font-medium underline">{t("Request credits", "Solicitar créditos")}</Link></p>}
            {progress && <div className="space-y-2"><p className="text-sm text-muted-foreground">{progress}</p><Progress value={progress === t("Creating your order…", "Creando tu pedido…") ? 90 : 50} /></div>}
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>{t("Back", "Atrás")}</Button>
          {step < 2 ? (
            <Button onClick={() => { if ((step === 0 && validateSource()) || (step === 1 && validateSubject())) setStep(step + 1); }}>{t("Continue", "Continuar")}</Button>
          ) : (
            <Button onClick={confirm} disabled={!enough || busy}>{busy ? t("Submitting…", "Enviando…") : t(`Confirm · ${cost} credit`, `Confirmar · ${cost} crédito`)}</Button>
          )}
        </div>
      </CardContent></Card>
    </div>
  );
}
