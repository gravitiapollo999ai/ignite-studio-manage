import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brandTitle } from "@/lib/data";
import { SOCIAL_PROVIDERS } from "@/lib/social";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/connections")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Connections") }] }),
  component: Connections,
});

function Connections() {
  const { user } = Route.useRouteContext();
  const { t } = useI18n();
  const conns = useQuery({ queryKey: ["social-connections", user.id], queryFn: async () => (await supabase.from("social_connections").select("*").eq("user_id", user.id)).data ?? [] });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("Connections", "Conexiones")}</h1>
        <p className="text-sm text-muted-foreground">{t("Connect your social accounts to publish finished videos with one click. We use each platform's official sign-in; we never ask for your password.", "Conecta tus redes sociales para publicar tus videos terminados con un clic. Usamos el inicio de sesión oficial de cada plataforma; nunca te pedimos tu contraseña.")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {SOCIAL_PROVIDERS.map((p) => {
          const c = conns.data?.find((x) => x.provider === p.id && x.status === "connected");
          return (
            <Card key={p.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>{p.name}</CardTitle>
                {c ? <Badge>{t("Connected", "Conectado")}</Badge> : <Badge variant="secondary">{t("Not connected", "No conectado")}</Badge>}</CardHeader>
              <CardContent className="space-y-3 text-sm">
                {c?.account_name && <p>{c.account_name}</p>}
                <p className="text-muted-foreground">{p.id === "instagram" ? t("Requires an Instagram Business or Creator account.", "Requiere una cuenta de Instagram de empresa o creador.") : p.later ? t("Coming later.", "Disponible más adelante.") : t("Publish videos straight to your TikTok.", "Publica videos directamente en tu TikTok.")}</p>
                <Button className="w-full" variant="outline" disabled>{t("Coming soon", "Próximamente")}</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
