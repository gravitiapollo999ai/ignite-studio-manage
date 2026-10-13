import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminSyncJob } from "@/lib/spoofer.functions";
import { errMsg } from "@/lib/data";
import { useI18n } from "@/lib/i18n";

/** Admin-only Spoofer sync status, log and manual send/retry for one job. */
export function SpooferSyncCard({ jobId }: { jobId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const sync = useServerFn(adminSyncJob);
  const [busy, setBusy] = useState(false);
  const row = useQuery({ queryKey: ["spoofer-sync", jobId], queryFn: async () => (await supabase.from("spoofer_sync").select("*").eq("job_id", jobId).maybeSingle()).data });
  const logs = useQuery({ queryKey: ["spoofer-log", jobId], queryFn: async () => (await supabase.from("spoofer_sync_log").select("*").eq("job_id", jobId).order("created_at", { ascending: false }).limit(20)).data ?? [] });
  const r = row.data;

  async function send() {
    setBusy(true);
    try {
      const res = await sync({ data: { jobId, force: r?.state === "failed" } });
      if (res.ok) toast.success(t("Sent to Spoofer", "Enviado a Spoofer"));
      else toast.error(res.error?.includes("SPOOFER_SYNC_SECRET") ? t("Sync secret not configured yet", "Falta configurar el secreto de sincronización") : t("Send failed — will retry", "Falló el envío — se reintentará"));
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: ["spoofer-sync", jobId] }); qc.invalidateQueries({ queryKey: ["spoofer-log", jobId] }); }
  }

  const stateLabel: Record<string, string> = { pending: t("Pending", "Pendiente"), sending: t("Sending", "Enviando"), synced: t("Synced", "Sincronizado"), failed: t("Failed", "Falló") };
  return (
    <Card className={r?.state === "failed" ? "border-destructive" : undefined}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">{r?.state === "failed" && <AlertTriangle className="h-4 w-4 text-destructive" />}{t("Spoofer sync", "Sincronización Spoofer")}</CardTitle>
        {r?.state !== "synced" && (
          <Button size="sm" variant="outline" onClick={send} disabled={busy || r?.state === "sending"}>
            {r ? <RefreshCw className="h-4 w-4" /> : <Send className="h-4 w-4" />}{r ? t("Retry now", "Reintentar ahora") : t("Send to Spoofer", "Enviar a Spoofer")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!r ? <p className="text-muted-foreground">{t("Not queued (job created before sync existed). Sending costs no credits.", "No en cola (pedido anterior a la sincronización). Enviarlo no cobra créditos.")}</p> : (
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">{t("State", "Estado")}</span><span>{stateLabel[r.state] ?? r.state}</span>
            <span className="text-muted-foreground">{t("Attempts", "Intentos")}</span><span>{r.attempts}</span>
            <span className="text-muted-foreground">{t("Spoofer job", "Pedido Spoofer")}</span><span className="break-all">{r.remote_job_id ?? "—"}</span>
            <span className="text-muted-foreground">{t("Spoofer status", "Estado Spoofer")}</span><span>{r.remote_status ?? "—"}</span>
            {r.last_error && <><span className="text-muted-foreground">{t("Last error", "Último error")}</span><span className="break-all text-destructive">{r.last_error}</span></>}
          </div>
        )}
        {(logs.data?.length ?? 0) > 0 && (
          <ul className="space-y-1 border-t pt-2">
            {logs.data!.map((l) => (
              <li key={l.id} className="flex justify-between gap-2"><span className={l.ok ? "" : "text-destructive"}>{l.direction === "outbound" ? "→" : "←"} {l.event}{l.http_status ? ` (${l.http_status})` : ""}</span><span className="text-muted-foreground">{format(new Date(l.created_at), "MMM d HH:mm")}</span></li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
