import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { CreditCard, Film, LayoutDashboard, LogOut, Shield, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandMark, SiteFooter } from "@/components/site";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

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
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/jobs", label: "Videos", icon: Film },
  { to: "/credits", label: "Credits", icon: CreditCard },
  { to: "/account", label: "Account", icon: User },
] as const;

function Layout() {
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <BrandMark />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground" activeProps={{ className: "bg-accent text-foreground" }}>
                {n.label}
              </Link>
            ))}
            {isAdmin && (
              <Link to="/admin" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground" activeProps={{ className: "bg-accent text-foreground" }}>Admin</Link>
            )}
          </nav>
          <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); nav({ to: "/" }); }}>
            <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:pb-10">
        <Outlet />
      </main>
      <SiteFooter />
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background md:hidden">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="flex flex-col items-center gap-1 py-2 text-xs text-muted-foreground" activeProps={{ className: "text-primary" }}>
            <n.icon className="h-5 w-5" />{n.label}
          </Link>
        ))}
        {isAdmin ? (
          <Link to="/admin" className="flex flex-col items-center gap-1 py-2 text-xs text-muted-foreground" activeProps={{ className: "text-primary" }}><Shield className="h-5 w-5" />Admin</Link>
        ) : <span />}
      </nav>
    </div>
  );
}
