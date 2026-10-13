import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/site";
import { brandTitle } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { HeaderControls } from "@/components/header-controls";

export const Route = createFileRoute("/forgot-password")({
  head: ({ matches }) => {
    const t = brandTitle(matches, "Reset password");
    return { meta: [{ title: t }, { name: "description", content: "Get a link to reset your password." }, { property: "og:title", content: t }, { property: "og:description", content: "Get a link to reset your password." }] };
  },
  component: Forgot,
});

function Forgot() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { t } = useI18n();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = z.string().trim().email().safeParse(new FormData(e.currentTarget).get("email"));
    if (!email.success) return toast.error(t("Enter a valid email", "Ingresa un correo válido"));
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSent(true);
    toast.success(t("Reset link sent", "Enlace de restablecimiento enviado"));
  }
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="fixed right-4 top-4"><HeaderControls /></div>
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center"><BrandMark /></div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-xl font-semibold">{t("Reset your password", "Restablece tu contraseña")}</h1>
          {sent ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("If an account exists, you'll get an email with a reset link shortly.", "Si existe una cuenta, recibirás un correo con un enlace de restablecimiento en breve.")}</p>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-4">
              <div className="space-y-2"><Label htmlFor="e">{t("Email", "Correo electrónico")}</Label><Input id="e" name="email" type="email" required /></div>
              <Button className="w-full" disabled={busy}>{busy ? t("Sending…", "Enviando…") : t("Send reset link", "Enviar enlace de restablecimiento")}</Button>
            </form>
          )}
          <Link to="/auth" className="mt-4 block text-center text-sm text-muted-foreground hover:text-foreground">{t("Back to log in", "Volver a iniciar sesión")}</Link>
        </div>
      </div>
    </div>
  );
}
