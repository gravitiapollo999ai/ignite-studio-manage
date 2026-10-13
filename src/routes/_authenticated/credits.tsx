import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, RequestBadge, useSettings } from "@/components/site";
import { CompareCost, ComingSoonButton, PackageCards } from "@/components/pricing-blocks";
import { balanceQuery, brandTitle, errMsg, packagesQuery } from "@/lib/data";
import { paymentProvider } from "@/lib/payments";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/credits")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Credits") }] }),
  component: Credits,
});

const REASON: Record<string, { en: string; es: string }> = {
  admin_grant: { en: "Credits added", es: "Créditos agregados" },
  job_reserve: { en: "Video ordered", es: "Video solicitado" },
  job_refund: { en: "Refund", es: "Reembolso" },
  adjustment: { en: "Adjustment", es: "Ajuste" },
};

function Credits() {
  const { user } = Route.useRouteContext();
  const { t, lang } = useI18n();
  const dateLocale = lang === "es" ? { locale: es } : undefined;
  const s = useSettings();
  const qc = useQueryClient();
  const pkgs = useQuery(packagesQuery);
  const bal = useQuery(balanceQuery(user.id));
  const reqs = useQuery({ queryKey: ["my-requests"], queryFn: async () => (await supabase.from("credit_requests").select("*, packages(name)").order("created_at", { ascending: false })).data ?? [] });
  const ledger = useQuery({ queryKey: ["my-ledger"], queryFn: async () => (await supabase.from("credit_ledger").select("*, jobs(code)").order("created_at", { ascending: false }).limit(100)).data ?? [] });
  const [open, setOpen] = useState(false);
  const [pkgId, setPkgId] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const openFor = (id?: string) => { setPkgId(id ?? pkgs.data?.[0]?.id ?? ""); setMsg(""); setOpen(true); };

  async function submit() {
    const p = pkgs.data?.find((x) => x.id === pkgId);
    if (!p) return toast.error(t("Choose a package", "Elige un paquete"));
    if (msg.length > 1000) return toast.error(t("Message too long", "El mensaje es demasiado largo"));
    setBusy(true);
    try {
      const r = await paymentProvider.start({ userId: user.id, packageId: p.id, credits: p.credits, message: msg.trim() });
      if (r.kind === "redirect") { window.location.href = r.url; return; }
      toast.success(t("Request sent — we'll confirm your credits shortly.", "Solicitud enviada — confirmaremos tus créditos en breve."));
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["my-requests"] });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold">{t("Credits", "Créditos")}</h1>
          <p className="text-sm text-muted-foreground">{t("Balance:", "Saldo:")} <strong className="text-foreground">{bal.data ?? "…"}</strong> {t("credits · USD 9 per credit · 1 credit per video (up to", "créditos · USD 9 por crédito · 1 crédito por video (hasta")} {s.max_video_seconds}{t("s, 1080p) · Minimum purchase", "s, 1080p) · Compra mínima")} {s.min_package_videos} {t("credits = USD", "créditos = USD")} {s.min_package_videos * 9}</p>
        </div>
        <Button onClick={() => openFor()}>{t("Request credits", "Solicitar créditos")}</Button>
      </div>
      {pkgs.isLoading ? <Skeleton className="h-64" /> : (
        <PackageCards packages={pkgs.data ?? []} settings={s} action={() => <ComingSoonButton />} />
      )}
      <section className="space-y-3"><h2 className="text-xl font-semibold">{t("Compare the cost", "Compara el costo")}</h2><CompareCost packages={pkgs.data ?? []} settings={s} /></section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("Requests", "Solicitudes")}</CardTitle></CardHeader>
          <CardContent>
            {reqs.data?.length === 0 ? <Empty title={t("No requests yet", "Aún no hay solicitudes")} /> : (
              <Table><TableHeader><TableRow><TableHead>{t("Date", "Fecha")}</TableHead><TableHead>{t("Package", "Paquete")}</TableHead><TableHead>{t("Credits", "Créditos")}</TableHead><TableHead>{t("Status", "Estado")}</TableHead></TableRow></TableHeader>
                <TableBody>{reqs.data?.map((r) => (
                  <TableRow key={r.id}><TableCell>{format(new Date(r.created_at), "MMM d", dateLocale)}</TableCell><TableCell>{r.packages?.name ?? "—"}{r.admin_note && <p className="text-xs text-muted-foreground">{r.admin_note}</p>}</TableCell><TableCell>{r.credits}</TableCell><TableCell><RequestBadge status={r.status} /></TableCell></TableRow>
                ))}</TableBody></Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("Credit history", "Historial de créditos")}</CardTitle></CardHeader>
          <CardContent>
            {ledger.data?.length === 0 ? <Empty title={t("No credit movements yet", "Aún no hay movimientos de créditos")} /> : (
              <Table><TableHeader><TableRow><TableHead>{t("Date", "Fecha")}</TableHead><TableHead>{t("Type", "Tipo")}</TableHead><TableHead className="text-right">{t("Credits", "Créditos")}</TableHead></TableRow></TableHeader>
                <TableBody>{ledger.data?.map((l) => (
                  <TableRow key={l.id}><TableCell>{format(new Date(l.created_at), "MMM d", dateLocale)}</TableCell><TableCell>{(REASON[l.reason] ? (lang === "es" ? REASON[l.reason].es : REASON[l.reason].en) : l.reason)}{l.jobs?.code && ` · ${l.jobs.code}`}</TableCell><TableCell className={`text-right font-medium ${l.delta > 0 ? "text-success" : ""}`}>{l.delta > 0 ? `+${l.delta}` : l.delta}</TableCell></TableRow>
                ))}</TableBody></Table>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Request credits", "Solicitar créditos")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("Package", "Paquete")}</Label>
              <Select value={pkgId} onValueChange={setPkgId}><SelectTrigger><SelectValue placeholder={t("Choose a package", "Elige un paquete")} /></SelectTrigger>
                <SelectContent>{pkgs.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.price_label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-2"><Label>{t("Message (optional)", "Mensaje (opcional)")}</Label><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={1000} placeholder={t("Anything we should know?", "¿Algo que debamos saber?")} /></div>
            <p className="text-xs text-muted-foreground">{t("We'll confirm payment details with you and add the credits once approved.", "Confirmaremos los detalles de pago contigo y agregaremos los créditos una vez aprobados.")}</p>
          </div>
          <DialogFooter><Button onClick={submit} disabled={busy}>{busy ? t("Sending…", "Enviando…") : paymentProvider.ctaLabel(t)}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
