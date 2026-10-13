import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandMark } from "@/components/site";
import { brandTitle, errMsg } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { HeaderControls } from "@/components/header-controls";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { mode?: "signup" } => (s["mode"] === "signup" ? { mode: "signup" } : {}),
  head: ({ matches }) => {
    const t = brandTitle(matches, "Log in or sign up");
    return { meta: [{ title: t }, { name: "description", content: "Access your video dashboard." }, { property: "og:title", content: t }, { property: "og:description", content: "Access your video dashboard." }] };
  },
  component: AuthPage,
});

const loginSchema = z.object({ email: z.string().trim().email("Enter a valid email"), password: z.string().min(6, "At least 6 characters") });
const signupSchema = loginSchema.extend({ full_name: z.string().trim().min(2, "Enter your name").max(100), company: z.string().trim().max(100).optional() });

function AuthPage() {
  const { mode } = Route.useSearch();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();

  async function onLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const p = loginSchema.safeParse(f);
    if (!p.success) return toast.error(t(p.error.issues[0].message, p.error.issues[0].message === "Enter a valid email" ? "Ingresa un correo válido" : "Mínimo 6 caracteres"));
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(p.data);
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success(t("Welcome back", "Bienvenido de nuevo"));
    nav({ to: "/dashboard" });
  }

  async function onSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const p = signupSchema.safeParse(f);
    if (!p.success) {
      const msg = p.error.issues[0].message;
      const es = msg === "Enter your name" ? "Ingresa tu nombre" : msg === "Enter a valid email" ? "Ingresa un correo válido" : msg === "At least 6 characters" ? "Mínimo 6 caracteres" : msg;
      return toast.error(t(msg, es));
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: p.data.email,
      password: p.data.password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { full_name: p.data.full_name, company: p.data.company } },
    });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    if (data.session) nav({ to: "/dashboard" });
    else toast.success(t("Check your email to confirm your account.", "Revisa tu correo para confirmar tu cuenta."));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero-glow px-4">
      <div className="fixed right-4 top-4"><HeaderControls /></div>
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center"><BrandMark /></div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <Tabs defaultValue={mode === "signup" ? "signup" : "login"}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">{t("Log in", "Iniciar sesión")}</TabsTrigger>
              <TabsTrigger value="signup">{t("Sign up", "Registrarse")}</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={onLogin} className="mt-4 space-y-4">
                <div className="space-y-2"><Label htmlFor="le">{t("Email", "Correo electrónico")}</Label><Input id="le" name="email" type="email" autoComplete="email" required /></div>
                <div className="space-y-2"><Label htmlFor="lp">{t("Password", "Contraseña")}</Label><Input id="lp" name="password" type="password" autoComplete="current-password" required /></div>
                <Button className="w-full" disabled={busy}>{busy ? t("Signing in…", "Iniciando sesión…") : t("Log in", "Iniciar sesión")}</Button>
                <Link to="/forgot-password" className="block text-center text-sm text-muted-foreground hover:text-foreground">{t("Forgot password?", "¿Olvidaste tu contraseña?")}</Link>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={onSignup} className="mt-4 space-y-4">
                <div className="space-y-2"><Label htmlFor="sn">{t("Full name", "Nombre completo")}</Label><Input id="sn" name="full_name" required /></div>
                <div className="space-y-2"><Label htmlFor="sc">{t("Company (optional)", "Empresa (opcional)")}</Label><Input id="sc" name="company" /></div>
                <div className="space-y-2"><Label htmlFor="se">{t("Email", "Correo electrónico")}</Label><Input id="se" name="email" type="email" autoComplete="email" required /></div>
                <div className="space-y-2"><Label htmlFor="sp">{t("Password", "Contraseña")}</Label><Input id="sp" name="password" type="password" autoComplete="new-password" required /></div>
                <Button className="w-full" disabled={busy}>{busy ? t("Creating account…", "Creando cuenta…") : t("Create account", "Crear cuenta")}</Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
