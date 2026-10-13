import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/site";
import { brandTitle } from "@/lib/data";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/clients/")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Admin · Clients") }] }),
  component: Clients,
});

function Clients() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const data = useQuery({
    queryKey: ["admin-clients"],
    queryFn: async () => {
      const [p, b, j] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("credit_balances").select("*"),
        supabase.from("jobs").select("user_id"),
      ]);
      const bal = new Map((b.data ?? []).map((x) => [x.user_id, x.balance]));
      const cnt = new Map<string, number>();
      (j.data ?? []).forEach((x) => cnt.set(x.user_id, (cnt.get(x.user_id) ?? 0) + 1));
      return (p.data ?? []).map((x) => ({ ...x, balance: bal.get(x.id) ?? 0, jobs: cnt.get(x.id) ?? 0 }));
    },
  });
  const rows = (data.data ?? []).filter((c) => !q || `${c.full_name} ${c.email} ${c.company}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("Clients", "Clientes")}</h1>
      <Input placeholder={t("Search name, email or company", "Buscar nombre, correo o empresa")} value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      {data.isLoading ? <Skeleton className="h-40" /> : rows.length === 0 ? <Empty title={t("No clients", "No hay clientes")} /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card"><Table>
          <TableHeader><TableRow><TableHead>{t("Name", "Nombre")}</TableHead><TableHead>{t("Company", "Empresa")}</TableHead><TableHead>{t("Email", "Correo")}</TableHead><TableHead className="text-right">{t("Balance", "Saldo")}</TableHead><TableHead className="text-right">{t("Jobs", "Trabajos")}</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((c) => (
            <TableRow key={c.id}><TableCell><Link to="/admin/clients/$clientId" params={{ clientId: c.id }} className="font-medium text-primary">{c.full_name || "—"}</Link></TableCell><TableCell>{c.company}</TableCell><TableCell>{c.email}</TableCell><TableCell className="text-right">{c.balance}</TableCell><TableCell className="text-right">{c.jobs}</TableCell></TableRow>
          ))}</TableBody>
        </Table></div>
      )}
    </div>
  );
}
