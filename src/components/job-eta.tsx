import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeEta, type EtaInputs } from "@/lib/eta";
import { errMsg } from "@/lib/data";
import { useI18n } from "@/lib/i18n";

function useEtaInputs(jobId: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["job-eta", jobId],
    queryFn: async () => (await supabase.rpc("get_job_eta", { _job_id: jobId })).data as EtaInputs | null,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const ch = supabase.channel(`eta-${jobId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_events", filter: `job_id=eq.${jobId}` }, () => qc.invalidateQueries({ queryKey: ["job-eta", jobId] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [jobId, qc]);
  return q;
}

/** "Estimated ready ~ 3:40 PM" in the viewer's local time. Never a guaranteed deadline. */
export function JobEta({ jobId }: { jobId: string }) {
  const { t, lang } = useI18n();
  const q = useEtaInputs(jobId);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const i = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(i); }, []);
  if (!q.data || !now) return null;
  const eta = computeEta(q.data, now);
  if (!eta) return null;
  const sameDay = eta.toDateString() === now.toDateString();
  const fmt = new Intl.DateTimeFormat(lang === "es" ? "es" : "en", sameDay ? { hour: "numeric", minute: "2-digit" } : { weekday: "short", hour: "numeric", minute: "2-digit" }).format(eta);
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
      <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div><p className="font-medium">{t("Estimated ready", "Listo aprox.")} ~ {fmt}</p>
        <p className="text-xs text-muted-foreground">{t("An estimate that updates as your video moves through each stage — not a guaranteed deadline.", "Una estimación que se actualiza en cada etapa — no es un plazo garantizado.")}</p></div>
    </div>
  );
}

/** Admin only (enforced by set_job_eta): whole-job ready time or per-stage minutes. */
export function JobEtaOverride({ jobId }: { jobId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [readyAt, setReadyAt] = useState("");
  const [rev, setRev] = useState(""); const [gen, setGen] = useState(""); const [qa, setQa] = useState("");
  const n = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.min(10080, Math.round(Number(v)))));
  async function save() {
    const { error } = await supabase.rpc("set_job_eta", {
      _job_id: jobId, _ready_at: (readyAt ? new Date(readyAt).toISOString() : null) as string,
      _review: n(rev) as number, _generating: n(gen) as number, _qa: n(qa) as number,
    });
    if (error) return toast.error(errMsg(error));
    toast.success(t("Estimate updated", "Estimación actualizada"));
    qc.invalidateQueries({ queryKey: ["job-eta", jobId] });
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1"><Label htmlFor="eta-ready">{t("Whole-job ready time (optional)", "Hora de entrega del pedido (opcional)")}</Label><Input id="eta-ready" type="datetime-local" value={readyAt} onChange={(e) => setReadyAt(e.target.value)} /></div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1"><Label htmlFor="eta-r">{t("Review min", "Revisión min")}</Label><Input id="eta-r" inputMode="numeric" value={rev} onChange={(e) => setRev(e.target.value)} placeholder="15" /></div>
        <div className="space-y-1"><Label htmlFor="eta-g">{t("Generating min", "Generación min")}</Label><Input id="eta-g" inputMode="numeric" value={gen} onChange={(e) => setGen(e.target.value)} placeholder="30" /></div>
        <div className="space-y-1"><Label htmlFor="eta-q">{t("QA min", "QA min")}</Label><Input id="eta-q" inputMode="numeric" value={qa} onChange={(e) => setQa(e.target.value)} placeholder="15" /></div>
      </div>
      <Button size="sm" variant="outline" onClick={save}>{t("Save estimate", "Guardar estimación")}</Button>
    </div>
  );
}
