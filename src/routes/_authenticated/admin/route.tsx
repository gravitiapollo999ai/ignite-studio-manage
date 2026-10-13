import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context }) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", context.user.id);
    const roles = (data ?? []).map((r) => String(r.role));
    const isAdmin = roles.includes("admin");
    if (!isAdmin && !roles.includes("manager")) throw redirect({ to: "/dashboard" });
    return { isAdmin };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { t } = useI18n();
  const { isAdmin } = Route.useRouteContext();
  const ALL = [
    { to: "/admin", label: t("Overview", "Resumen"), exact: true, admin: true },
    { to: "/admin/jobs", label: t("Jobs", "Trabajos"), admin: true },
    { to: "/admin/credit-requests", label: t("Credit requests", "Solicitudes de créditos"), admin: true },
    { to: "/admin/clients", label: t("Users", "Usuarios"), admin: false },
    { to: "/admin/team", label: t("Team & roles", "Equipo y roles"), admin: true },
    { to: "/admin/packages", label: t("Packages", "Paquetes"), admin: true },
    { to: "/admin/settings", label: t("Settings", "Configuración"), admin: true },
    { to: "/admin/api", label: t("API", "API"), admin: true },
  ] as const;
  const LINKS = ALL.filter((l) => isAdmin || !l.admin);
  return (
    <div className="space-y-6">
      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} activeOptions={{ exact: "exact" in l }} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground" activeProps={{ className: "bg-accent text-foreground" }}>{l.label}</Link>
        ))}
      </nav>
      {!isAdmin && <p className="text-sm text-muted-foreground">{t("Manager access: you can view users and grant or remove free credits.", "Acceso de gerente: puedes ver usuarios y otorgar o quitar créditos gratis.")}</p>}
      <Outlet />
    </div>
  );
}
