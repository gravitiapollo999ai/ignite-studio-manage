import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context }) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", context.user.id).eq("role", "admin").maybeSingle();
    if (!data) throw redirect({ to: "/dashboard" });
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { t } = useI18n();
  const LINKS = [
    { to: "/admin", label: t("Overview", "Resumen"), exact: true },
    { to: "/admin/jobs", label: t("Jobs", "Trabajos") },
    { to: "/admin/credit-requests", label: t("Credit requests", "Solicitudes de créditos") },
    { to: "/admin/clients", label: t("Clients", "Clientes") },
    { to: "/admin/packages", label: t("Packages", "Paquetes") },
    { to: "/admin/settings", label: t("Settings", "Configuración") },
    { to: "/admin/api", label: t("API", "API") },
  ] as const;
  return (
    <div className="space-y-6">
      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} activeOptions={{ exact: "exact" in l }} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground" activeProps={{ className: "bg-accent text-foreground" }}>{l.label}</Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
