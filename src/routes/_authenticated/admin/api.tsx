import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brandTitle, settingsQuery } from "@/lib/data";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/api")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Admin · Production API") }] }),
  component: ApiPage,
});

function Code({ children }: { children: string }) {
  const { t } = useI18n();
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-secondary p-4 text-xs"><code>{children}</code></pre>
      <Button size="icon" variant="ghost" className="absolute right-2 top-2" onClick={() => { navigator.clipboard.writeText(children); toast.success(t("Copied", "Copiado")); }} aria-label={t("Copy", "Copiar")}><Copy className="h-4 w-4" /></Button>
    </div>
  );
}

function ApiPage() {
  const { t, lang } = useI18n();
  const s = useQuery({ ...settingsQuery, staleTime: 0 });
  const [origin, setOrigin] = useState("https://your-app-url");
  useEffect(() => setOrigin(window.location.origin), []);
  const base = `${origin}/api/public/jobs-feed`;
  const last = s.data?.feed_last_success_at;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">{t("Production feed API", "API del feed de producción")}</h1>
        {last ? <Badge className="bg-success/20 text-foreground">{t("Last successful call", "Última llamada exitosa")} {formatDistanceToNow(new Date(last), { addSuffix: true, locale: (lang === "es" ? es : undefined) as any })}</Badge> : <Badge variant="outline">{t("Not verified — no successful call yet", "No verificado — aún no hay llamadas exitosas")}</Badge>}
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        {t(
          "Pull-based feed for the production team. Each job includes its ID, code, specs, the source link or a 24h download link for the uploaded video, and a 24h download link for the client's subject reference image. Client emails and billing are never included. Authenticate with the",
          "Feed de extracción para el equipo de producción. Cada trabajo incluye su ID, código, especificaciones, el enlace de la fuente o un enlace de descarga de 24h para el video subido, y un enlace de descarga de 24h para la imagen de referencia del sujeto del cliente. Los correos y la facturación del cliente nunca se incluyen. Autentícate con el encabezado"
        )} <code>x-api-key</code> {t("header using the", "usando el")} <strong>JOBS_FEED_API_KEY</strong> {t("secret (stored securely in your backend settings). This page does not connect to any production system by itself.", "secreto (almacenado de forma segura en la configuración de tu backend). Esta página no se conecta por sí sola a ningún sistema de producción.")}
      </p>
      <Card><CardHeader><CardTitle>{t("List jobs", "Listar trabajos")}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
        <p>{t("Optional query params:", "Parámetros de consulta opcionales:")} <code>status</code> ({t("e.g. submitted, in_review, revision", "ej. submitted, in_review, revision")}) {t("and", "y")} <code>since</code> ({t("ISO date, filters by last update", "fecha ISO, filtra por última actualización")}).</p>
        <Code>{`curl -H "x-api-key: $JOBS_FEED_API_KEY" \\\n  "${base}?status=submitted&since=2026-01-01T00:00:00Z"`}</Code>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t("Update status", "Actualizar estado")}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
        <p>{t("Allowed statuses: submitted, in_review, prompt_ready, generating, qa, delivered, revision, cancelled. The message is shown to the client.", "Estados permitidos: submitted, in_review, prompt_ready, generating, qa, delivered, revision, cancelled. El mensaje se muestra al cliente.")}</p>
        <Code>{`curl -X POST -H "x-api-key: $JOBS_FEED_API_KEY" -H "Content-Type: application/json" \\\n  -d '{"job_id":"<uuid>","status":"generating","message":"Your video is being produced"}' \\\n  "${base}/status"`}</Code>
      </CardContent></Card>
    </div>
  );
}
