import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { verifySourceVideo } from "@/lib/source-video.functions";
import { attachLinkSource } from "@/lib/final-upload.functions";
import { isRestrictedReason } from "@/lib/segment-reasons";

type J = { id: string; source_type: string; source_sha256: string | null; segment_reason: string | null; status: string; reference_image_path: string | null; try_number: number; source_file_path: string | null };

export function needsLinkSource(j: J) {
  return j.source_type !== "upload" && !j.source_sha256 && !j.source_file_path && ["submitted", "in_review", "prompt_ready"].includes(j.status) && isRestrictedReason(j.segment_reason) && !["delivered", "cancelled"].includes(j.status);
}

/** Link jobs must get a real uploaded MP4 before limited-segment production. No downloading from social sites. */
export function LinkSourceUpload({ job, queryKey }: { job: J; queryKey: unknown[] }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const verify = useServerFn(verifySourceVideo);
  const attach = useServerFn(attachLinkSource);
  const [busy, setBusy] = useState(false);
  if (!needsLinkSource(job)) return null;

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    const expectedTry = job.try_number; // captured before upload: a newer attempt makes this attach stale
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const path = `${u.user.id}/${crypto.randomUUID()}.mp4`;
      const up = await supabase.storage.from("source-videos").upload(path, f, { contentType: "video/mp4", upsert: false });
      if (up.error) throw up.error;
      const v = await verify({ data: { path } });
      if (!v.ok) return toast.error(v.reason === "too_long" ? t("This clip is longer than 30 seconds.", "Este clip dura más de 30 segundos.")
        : v.reason === "rejected_media" ? t("This file isn't a valid MP4 video.", "Este archivo no es un video MP4 válido.")
        : t("We couldn't check the video. Try again.", "No pudimos revisar el video. Inténtalo de nuevo."));
      const a = await attach({ data: { jobId: job.id, path, expectedTry } });
      if (!a.ok) return toast.error(a.reason === "stale_attempt" || a.reason === "wrong_status" ? t("This order moved on; refresh the page.", "Este pedido avanzó; actualiza la página.")
        : a.reason === "missing_reference" ? t("A subject reference image is required first.", "Primero se necesita una imagen de referencia del sujeto.")
        : t("Could not attach the video (" + a.reason + ").", "No se pudo adjuntar el video (" + a.reason + ")."));
      toast.success(t("Source video verified and attached", "Video fuente verificado y adjuntado"));
      qc.invalidateQueries({ queryKey });
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
      <p className="font-medium">{t("Upload this clip as an MP4 before production", "Sube este clip como MP4 antes de la producción")}</p>
      <p className="mt-1 text-muted-foreground">{t("Links can't be used for a limited segment. Upload the same clip as an MP4 file; we check it and pair it with the subject reference.", "Los enlaces no se pueden usar para un segmento limitado. Sube el mismo clip como archivo MP4; lo revisamos y lo emparejamos con la referencia del sujeto.")}</p>
      <label className="mt-3 inline-block">
        <input type="file" accept="video/mp4" className="sr-only" disabled={busy} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <Button asChild size="sm" disabled={busy}><span><Upload className="mr-1 h-4 w-4" />{busy ? t("Checking…", "Revisando…") : t("Upload MP4", "Subir MP4")}</span></Button>
      </label>
    </div>
  );
}
