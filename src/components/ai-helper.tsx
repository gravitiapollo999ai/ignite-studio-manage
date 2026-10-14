import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { aiDraftPrompt, aiHelperStatus, aiImproveBrief } from "@/lib/ai-helper.functions";
import { useI18n } from "@/lib/i18n";

export function useAiReasonText() {
  const { t } = useI18n();
  return (reason: string) => ({
    not_configured: t("AI helper not configured yet.", "Asistente IA aún no configurado."),
    quota: t("Daily AI helper limit reached. Try again tomorrow.", "Llegaste al límite diario del asistente IA. Inténtalo mañana."),
    rate_limited: t("The AI service is busy. Try again in a minute.", "El servicio de IA está ocupado. Inténtalo en un minuto."),
    timeout: t("The AI helper took too long. Try again.", "El asistente IA tardó demasiado. Inténtalo de nuevo."),
    invalid_output: t("The AI helper returned an unusable answer. Try again.", "El asistente IA devolvió una respuesta no válida. Inténtalo de nuevo."),
    model_rejected: t("The AI model isn't available right now.", "El modelo de IA no está disponible ahora."),
    forbidden: t("Not allowed.", "No permitido."),
    not_found: t("Order not found.", "Pedido no encontrado."),
  }[reason] ?? t("The AI helper is unavailable right now.", "El asistente IA no está disponible ahora."));
}

function useConfigured() {
  const status = useServerFn(aiHelperStatus);
  return useQuery({ queryKey: ["ai-helper-status"], queryFn: () => status(), staleTime: 60_000 });
}

/** Client: improves the draft brief; the client still edits and submits it themselves. */
export function ImproveBriefButton({ draft, businessType, subjectType, onResult }: { draft: string; businessType?: string; subjectType?: string; onResult: (text: string) => void }) {
  const { t, lang } = useI18n();
  const cfg = useConfigured();
  const run = useServerFn(aiImproveBrief);
  const reasonText = useAiReasonText();
  const [busy, setBusy] = useState(false);
  const configured = cfg.data?.configured === true;
  async function go() {
    if (draft.trim().length < 5) return toast.error(t("Write a few words first.", "Escribe algunas palabras primero."));
    setBusy(true);
    try {
      const r = await run({ data: { draft: draft.trim(), business_type: businessType ?? null, subject_type: subjectType ?? null } });
      if (!r.ok) return toast.error(reasonText(r.reason));
      onResult(lang === "es" ? r.brief_es : r.brief_en);
      toast.success(t("Brief improved — review it before ordering.", "Brief mejorado — revísalo antes de pedir."));
    } catch { toast.error(reasonText("error")); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={go} disabled={!configured || busy}>
        <Sparkles className="h-4 w-4" />{busy ? t("Improving…", "Mejorando…") : t("Help me write my brief", "Ayúdame con mi brief")}
      </Button>
      {cfg.data && !configured && <span className="text-xs text-muted-foreground">{reasonText("not_configured")}</span>}
    </div>
  );
}

/** Staff: drafts a Seedance prompt into the editor; staff must review and save it themselves. */
export function DraftPromptButton({ jobId, onResult }: { jobId: string; onResult: (text: string) => void }) {
  const { t } = useI18n();
  const cfg = useConfigured();
  const run = useServerFn(aiDraftPrompt);
  const reasonText = useAiReasonText();
  const [busy, setBusy] = useState(false);
  const configured = cfg.data?.configured === true;
  async function go() {
    setBusy(true);
    try {
      const r = await run({ data: { jobId } });
      if (!r.ok) return toast.error(reasonText(r.reason));
      onResult(r.draft);
      toast.success(t("Draft added — review, then save. Captain gates still apply.", "Borrador añadido — revísalo y guarda. Siguen aplicando los controles del capitán."));
    } catch { toast.error(reasonText("error")); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={go} disabled={!configured || busy}>
        <Sparkles className="h-4 w-4" />{busy ? t("Drafting…", "Redactando…") : t("Draft Seedance prompt", "Redactar prompt de Seedance")}
      </Button>
      {cfg.data && !configured && <span className="text-xs text-muted-foreground">{reasonText("not_configured")}</span>}
    </div>
  );
}
