import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { brandTitle } from "@/lib/data";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/account")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Account") }] }),
  component: Account,
});

function Account() {
  const { user } = Route.useRouteContext();
  const { t } = useI18n();
  const schema = z.object({
    full_name: z.string().trim().min(1, t("Name required", "El nombre es obligatorio")).max(100),
    company: z.string().trim().max(100),
    phone: z.string().trim().max(40),
  });
  const qc = useQueryClient();
  const prof = useQuery({ queryKey: ["profile", user.id], queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()).data });
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!p.success) return toast.error(p.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.from("profiles").update(p.data).eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("Profile saved", "Perfil guardado"));
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  }
  async function changePw(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = String(f.get("password") ?? "");
    if (pw.length < 6) return toast.error(t("At least 6 characters", "Al menos 6 caracteres"));
    if (pw !== f.get("confirm")) return toast.error(t("Passwords don't match", "Las contraseñas no coinciden"));
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast.error(error.message);
    toast.success(t("Password changed", "Contraseña actualizada"));
    e.currentTarget.reset();
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{t("Account", "Cuenta")}</h1>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link to="/business" search={{}}>{t("Business profile", "Perfil del negocio")}</Link></Button>
        <Button asChild variant="outline"><Link to="/connections">{t("Connections", "Conexiones")}</Link></Button>
      </div>
      <Card><CardHeader><CardTitle>{t("Profile", "Perfil")}</CardTitle></CardHeader><CardContent>
        {prof.isLoading ? <Skeleton className="h-48" /> : (
          <form onSubmit={save} className="space-y-4" key={prof.data?.id}>
            <div className="space-y-2"><Label>{t("Email", "Correo electrónico")}</Label><Input value={user.email ?? ""} disabled /></div>
            <div className="space-y-2"><Label htmlFor="fn">{t("Full name", "Nombre completo")}</Label><Input id="fn" name="full_name" defaultValue={prof.data?.full_name ?? ""} /></div>
            <div className="space-y-2"><Label htmlFor="co">{t("Company", "Empresa")}</Label><Input id="co" name="company" defaultValue={prof.data?.company ?? ""} /></div>
            <div className="space-y-2"><Label htmlFor="ph">{t("Phone", "Teléfono")}</Label><Input id="ph" name="phone" defaultValue={prof.data?.phone ?? ""} /></div>
            <Button disabled={busy}>{busy ? t("Saving…", "Guardando…") : t("Save", "Guardar")}</Button>
          </form>
        )}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t("Change password", "Cambiar contraseña")}</CardTitle></CardHeader><CardContent>
        <form onSubmit={changePw} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="np">{t("New password", "Nueva contraseña")}</Label><Input id="np" name="password" type="password" /></div>
          <div className="space-y-2"><Label htmlFor="cp">{t("Confirm", "Confirmar")}</Label><Input id="cp" name="confirm" type="password" /></div>
          <Button>{t("Update password", "Actualizar contraseña")}</Button>
        </form>
      </CardContent></Card>
    </div>
  );
}
