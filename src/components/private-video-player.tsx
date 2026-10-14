import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { signedUrl } from "@/lib/data";
import { useI18n } from "@/lib/i18n";

/** Inline player for a private deliverable. The short-lived signed URL is issued by storage only to the job owner or an admin.
 *  If playback fails (e.g. the link expired) it silently re-signs once, then shows Try again. */
export function PrivateVideoPlayer({ path, title }: { path: string; title?: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const autoRetried = useRef(false);
  const load = useCallback(async () => {
    setState("loading");
    try { setUrl(await signedUrl("deliverables", path, 900)); setState("ready"); }
    catch { setState("error"); }
  }, [path]);
  useEffect(() => { autoRetried.current = false; void load(); }, [load]);
  const retry = () => { autoRetried.current = false; void load(); };

  if (state === "loading") return <Skeleton className="aspect-[9/16] w-full max-w-xs" aria-label={t("Loading video…", "Cargando video…")} />;
  if (state === "error") return (
    <div role="alert" className="flex max-w-xs flex-col items-start gap-2 rounded-md border border-border p-3 text-sm">
      <p className="text-muted-foreground">{t("We couldn't load the video.", "No pudimos cargar el video.")}</p>
      <Button size="sm" variant="outline" onClick={retry}>{t("Try again", "Reintentar")}</Button>
    </div>
  );
  return (
    <video key={url} src={url ?? undefined} controls playsInline preload="metadata"
      aria-label={title ?? t("Final video", "Video final")}
      className="aspect-[9/16] w-full max-w-xs rounded-md bg-muted"
      onError={() => { if (!autoRetried.current) { autoRetried.current = true; void load(); } else setState("error"); }} />
  );
}
