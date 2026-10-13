import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/site";
import { brandTitle } from "@/lib/data";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/team")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Admin · Team & roles") }] }),
  component: Team,
});

function Team() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "manager">("manager");
  const [busy, setBusy] = useState(false);
  const staff = useQuery({
    queryKey: ["admin-staff"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const st = (roles ?? []).filter((r) => r.role === "admin" || String(r.role) === "manager");
      const ids = [...new Set(st.map((r) => r.user_id))];
      if (!ids.length) return [];
      const { data: profs } = await supabase.from("profiles").select("id,email,full_name").in("id", ids);
      return st.map((r) => ({ ...r, role: String(r.role), profile: profs?.find((p) => p.id === r.user_id) }));
    },
  });
  const roleLabel = (r: string) => (r === "admin" ? t("Admin", "Administrador") : t("Manager", "Gerente"));

  async function change(userId: string, r: string, grant: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("set_user_role", { _user_id: userId, _role: r, _grant: grant });
    setBusy(false);
    if (error) return toast.error(error.message === "Cannot remove the last admin" ? t("You can't remove the last admin.", "No puedes quitar al último administrador.") : error.message);
    toast.success(grant ? t("Role granted", "Rol otorgado") : t("Role removed", "Rol eliminado"));
    qc.invalidateQueries({ queryKey: ["admin-staff"] });
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em) return;
    const { data } = await supabase.from("profiles").select("id").ilike("email", em).maybeSingle();
    if (!data) return toast.error(t("No user with that email. They must sign up first.", "No hay un usuario con ese correo. Primero debe registrarse."));
    await change(data.id, role, true);
    setEmail("");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("Team & roles", "Equipo y roles")}</h1>
      <Card><CardHeader><CardTitle>{t("Add an admin or manager", "Agregar administrador o gerente")}</CardTitle></CardHeader><CardContent>
        <p className="mb-3 text-sm text-muted-foreground">{t("Admins have full access. Managers can view users and grant or remove free credits.", "Los administradores tienen acceso total. Los gerentes pueden ver usuarios y otorgar o quitar créditos gratis.")}</p>
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <Input type="email" placeholder={t("User's email", "Correo del usuario")} value={email} onChange={(e) => setEmail(e.target.value)} />
          <Select value={role} onValueChange={(v) => setRole(v as "admin" | "manager")}><SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="manager">{roleLabel("manager")}</SelectItem><SelectItem value="admin">{roleLabel("admin")}</SelectItem></SelectContent></Select>
          <Button disabled={busy}>{t("Grant role", "Otorgar rol")}</Button>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t("Current team", "Equipo actual")}</CardTitle></CardHeader><CardContent>
        {staff.isLoading ? <Skeleton className="h-24" /> : !staff.data?.length ? <Empty title={t("No admins yet", "Aún no hay administradores")} /> : (
          <div className="divide-y divide-border">{staff.data.map((s) => (
            <div key={`${s.user_id}-${s.role}`} className="flex items-center justify-between gap-3 py-3">
              <div><p className="font-medium">{s.profile?.full_name || s.profile?.email}</p><p className="text-xs text-muted-foreground">{s.profile?.email} · {roleLabel(s.role)}</p></div>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => change(s.user_id, s.role, false)}>{t("Remove", "Quitar")}</Button>
            </div>
          ))}</div>
        )}
      </CardContent></Card>
    </div>
  );
}
