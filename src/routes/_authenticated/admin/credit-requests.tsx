import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, RequestBadge } from "@/components/site";
import { brandTitle } from "@/lib/data";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/credit-requests")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Admin · Credit requests") }] }),
  component: Requests,
});

function Requests() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const profiles = useQuery({ queryKey: ["admin-profiles"], queryFn: async () => (await supabase.from("profiles").select("id,full_name,email,company")).data ?? [] });
  const reqs = useQuery({
    queryKey: ["admin-cr", tab],
    queryFn: async () => {
      let q = supabase.from("credit_requests").select("*, packages(name,price_label)").order("created_at", { ascending: false });
      if (tab !== "all") q = q.eq("status", tab);
      return (await q).data ?? [];
    },
  });
  const who = (id: string) => { const p = profiles.data?.find((x) => x.id === id); return p ? `${p.full_name ?? ""} ${p.company ? `(${p.company})` : ""} · ${p.email}` : id; };
  async function act(id: string, approve: boolean) {
    const note = notes[id]?.trim() || null;
    if (!approve && !note) return toast.error(t("Add a note explaining the rejection", "Agrega una nota explicando el rechazo"));
    const { error } = approve ? await supabase.rpc("approve_credit_request", { _id: id, _note: note as string }) : await supabase.rpc("reject_credit_request", { _id: id, _note: note! });
    if (error) return toast.error(error.message);
    toast.success(approve ? t("Approved — credits added", "Aprobado — créditos agregados") : t("Request rejected", "Solicitud rechazada"));
    qc.invalidateQueries({ queryKey: ["admin-cr"] });
    qc.invalidateQueries({ queryKey: ["admin-cr-pending-count"] });
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("Credit requests", "Solicitudes de créditos")}</h1>
      <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="pending">{t("Pending", "Pendiente")}</TabsTrigger><TabsTrigger value="approved">{t("Approved", "Aprobado")}</TabsTrigger><TabsTrigger value="rejected">{t("Rejected", "Rechazado")}</TabsTrigger><TabsTrigger value="all">{t("All", "Todos")}</TabsTrigger></TabsList></Tabs>
      {reqs.isLoading ? <Skeleton className="h-40" /> : reqs.data!.length === 0 ? <Empty title={t("Nothing here", "No hay nada aquí")} /> : (
        <div className="space-y-3">{reqs.data!.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-medium">{r.packages?.name ?? t("Credits", "Créditos")} · {r.credits} {t("credits", "créditos")} <span className="text-muted-foreground">({r.packages?.price_label})</span></p>
                <p className="text-sm text-muted-foreground">{who(r.user_id)} · {format(new Date(r.created_at), "MMM d, HH:mm", { locale: lang === "es" ? es : undefined })}</p>
                {r.client_message && <p className="mt-2 text-sm">“{r.client_message}”</p>}
                {r.admin_note && r.status !== "pending" && <p className="mt-1 text-sm text-muted-foreground">{t("Note", "Nota")}: {r.admin_note}</p>}
              </div>
              <RequestBadge status={r.status} />
            </div>
            {r.status === "pending" && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input placeholder={t("Note (payment reference, reason…)", "Nota (referencia de pago, motivo…)")} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                <Button onClick={() => act(r.id, true)}>{t("Approve", "Aprobar")}</Button>
                <Button variant="outline" onClick={() => act(r.id, false)}>{t("Reject", "Rechazar")}</Button>
              </div>
            )}
          </div>
        ))}</div>
      )}
    </div>
  );
}
