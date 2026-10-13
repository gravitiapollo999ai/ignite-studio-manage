import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, StatusBadge } from "@/components/site";
import { balanceQuery, brandTitle, signedUrl } from "@/lib/data";
import { BUSINESS_FIELDS } from "@/lib/business";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/clients/$clientId")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Admin · Client") }] }),
  component: Client,
});

function Client() {
  const { t, lang } = useI18n();
  const dateLocale = lang === "es" ? es : undefined;
  const { clientId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const prof = useQuery({ queryKey: ["admin-profile", clientId], queryFn: async () => (await supabase.from("profiles").select("*").eq("id", clientId).maybeSingle()).data });
  const bal = useQuery(balanceQuery(clientId));
  const jobs = useQuery({ queryKey: ["admin-client-jobs", clientId], queryFn: async () => (await supabase.from("jobs").select("id,code,status,subject_name,created_at").eq("user_id", clientId).order("created_at", { ascending: false })).data ?? [] });
  const notes = useQuery({ queryKey: ["client-notes", clientId], queryFn: async () => (await supabase.from("client_notes").select("*").eq("client_id", clientId).order("created_at", { ascending: false })).data ?? [] });
  const ledger = useQuery({ queryKey: ["admin-ledger", clientId], queryFn: async () => (await supabase.from("credit_ledger").select("*").eq("user_id", clientId).order("created_at", { ascending: false }).limit(50)).data ?? [] });
  const biz = useQuery({ queryKey: ["admin-business", clientId], queryFn: async () => (await supabase.from("business_profiles").select("*").eq("user_id", clientId).maybeSingle()).data });
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => { if (biz.data?.logo_path) signedUrl("business-logos", biz.data.logo_path, 3600).then(setLogo).catch(() => {}); }, [biz.data?.logo_path]);
  const [note, setNote] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");

  async function addNote() {
    if (!note.trim()) return;
    const { error } = await supabase.from("client_notes").insert({ client_id: clientId, author_id: user.id, note: note.trim() });
    if (error) return toast.error(error.message);
    setNote(""); toast.success(t("Note added", "Nota agregada"));
    qc.invalidateQueries({ queryKey: ["client-notes", clientId] });
  }
  async function adjust() {
    const n = Number(delta);
    if (!Number.isInteger(n) || n === 0) return toast.error(t("Enter a whole number like 5 or -2", "Ingresa un número entero como 5 o -2"));
    if (!reason.trim()) return toast.error(t("Reason required", "Se requiere un motivo"));
    const { error } = await supabase.rpc("admin_adjust_credits", { _user_id: clientId, _delta: n, _note: reason.trim() });
    if (error) return toast.error(error.message);
    setDelta(""); setReason(""); toast.success(t("Balance adjusted", "Saldo ajustado"));
    qc.invalidateQueries({ queryKey: ["balance", clientId] });
    qc.invalidateQueries({ queryKey: ["admin-ledger", clientId] });
  }

  if (prof.isLoading) return <Skeleton className="h-64" />;
  if (!prof.data) return <Empty title={t("Client not found", "Cliente no encontrado")} />;
  const p = prof.data;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">{p.full_name || p.email}</h1><p className="text-sm text-muted-foreground">{p.company} · {p.email} {p.phone && `· ${p.phone}`}</p></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>{t("Balance", "Saldo")}: {bal.data ?? "…"}</CardTitle></CardHeader><CardContent className="space-y-2">
          <Input placeholder={t("+5 or -2", "+5 o -2")} value={delta} onChange={(e) => setDelta(e.target.value)} />
          <Input placeholder={t("Note (required)", "Nota (obligatoria)")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button className="w-full" onClick={adjust}>{t("Grant / remove free credits", "Otorgar / quitar créditos gratis")}</Button>
          <div className="max-h-56 space-y-1 overflow-y-auto pt-2 text-sm">{ledger.data?.map((l) => (
            <div key={l.id} className="flex justify-between"><span className="text-muted-foreground">{format(new Date(l.created_at), "MMM d", { locale: dateLocale as any })} · {l.reason}{l.note ? ` — ${l.note}` : ""}</span><span>{l.delta > 0 ? `+${l.delta}` : l.delta}</span></div>
          ))}</div>
        </CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle>{t("Internal notes", "Notas internas")}</CardTitle></CardHeader><CardContent className="space-y-3">
          <div className="flex gap-2"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Only admins can see this", "Solo los administradores pueden ver esto")} rows={2} /><Button onClick={addNote}>{t("Add", "Agregar")}</Button></div>
          {notes.data?.map((n) => <div key={n.id} className="rounded-lg bg-secondary p-3 text-sm"><p className="text-xs text-muted-foreground">{format(new Date(n.created_at), "MMM d, HH:mm", { locale: dateLocale as any })}</p><p className="whitespace-pre-wrap">{n.note}</p></div>)}
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>{t("Business profile", "Perfil del negocio")}</CardTitle></CardHeader><CardContent>
        {!biz.data ? <p className="text-sm text-muted-foreground">{t("Not filled in yet.", "Aún no lo ha completado.")}</p> : (
          <div className="space-y-3">
            {logo && <img src={logo} alt={t("Business logo", "Logo del negocio")} className="h-16 w-16 rounded-md border border-border object-contain" />}
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">{BUSINESS_FIELDS.map((f) => (
              <div key={f.key} className={f.long ? "sm:col-span-2" : ""}><dt className="text-muted-foreground">{lang === "es" ? f.es : f.en}</dt><dd className="whitespace-pre-wrap break-words">{(biz.data![f.key] as string) || "—"}</dd></div>
            ))}</dl>
          </div>
        )}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t("Jobs", "Trabajos")}</CardTitle></CardHeader><CardContent>
        {jobs.data?.length === 0 ? <Empty title={t("No jobs yet", "Aún no hay trabajos")} /> : <div className="divide-y divide-border">{jobs.data?.map((j) => (
          <Link key={j.id} to="/admin/jobs/$jobId" params={{ jobId: j.id }} className="flex items-center justify-between py-2 hover:bg-accent/40"><span>{j.code} · {j.subject_name}</span><StatusBadge status={j.status} /></Link>
        ))}</div>}
      </CardContent></Card>
    </div>
  );
}
