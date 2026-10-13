import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, Film, LayoutDashboard, LogOut, Shield, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandMark, SiteFooter } from "@/components/site";
import { Button } from "@/components/ui/button";
import { HeaderControls } from "@/components/header-controls";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

const NAV = [
  { to: "/dashboard", label: { en: "Dashboard", es: "Panel" }, icon: LayoutDashboard },
  { to: "/jobs", label: { en: "Videos", es: "Videos" }, icon: Film },
  { to: "/credits", label: { en: "Credits", es: "Créditos" }, icon: CreditCard },
  { to: "/account", label: { en: "Account", es: "Cuenta" }, icon: User },
] as const;

function Layout() {
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { t, lang } = useI18n();

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <BrandMark />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground" activeProps={{ className: "bg-accent text-foreground" }}>
                {lang === "es" ? n.label.es : n.label.en}
              </Link>
            ))}
            {isAdmin && (
              <Link to="/admin" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground" activeProps={{ className: "bg-accent text-foreground" }}>{t("Admin", "Administración")}</Link>
            )}
          </nav>
          <div className="flex items-center gap-2">
            <HeaderControls />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">{t("Sign out", "Cerrar sesión")}</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:pb-10">
        <Outlet />
      </main>
      <SiteFooter />
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background md:hidden">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="flex flex-col items-center gap-1 py-2 text-xs text-muted-foreground" activeProps={{ className: "text-primary" }}>
            <n.icon className="h-5 w-5" />{lang === "es" ? n.label.es : n.label.en}
          </Link>
        ))}
        {isAdmin ? (
          <Link to="/admin" className="flex flex-col items-center gap-1 py-2 text-xs text-muted-foreground" activeProps={{ className: "text-primary" }}><Shield className="h-5 w-5" />{t("Admin", "Admin")}</Link>
        ) : <span />}
      </nav>
    </div>
  );
}
