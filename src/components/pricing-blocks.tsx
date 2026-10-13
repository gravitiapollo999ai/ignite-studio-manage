import { Check } from "lucide-react";
import type { Pkg, Settings } from "@/lib/data";
import { hfCostPerTry, perVideoPrice } from "@/lib/pricing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useI18n, pkgText } from "@/lib/i18n";

export function ComingSoonButton() {
  const { t, lang } = useI18n();
  return (
    <Button disabled variant="outline" className="w-full">
      {t("Coming soon", "Próximamente")}
    </Button>
  );
}

export function PackageCards({ packages, settings, action }: { packages: Pkg[]; settings: Settings; action?: (p: Pkg) => React.ReactNode }) {
  const { t, lang } = useI18n();
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {packages.map((p, i) => (
        <Card key={p.id} className={i === 1 ? "border-primary shadow-lg" : ""}>
          <CardHeader>
            <CardTitle className="text-lg">{pkgText(p.name, lang)}</CardTitle>
            <p className="text-3xl font-semibold font-display">{p.price_label}</p>
            <p className="text-sm text-muted-foreground">{p.credits} {t("credits", "créditos")} · {perVideoPrice(p.price_label, p.videos) ?? "—"} {t("per video", "por video")}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {p.description && <p className="text-sm text-muted-foreground">{pkgText(p.description, lang)}</p>}
            <ul className="space-y-1.5 text-sm">
              {[
                t(`${p.videos} finished videos`, `${p.videos} videos terminados`),
                t(`Up to ${settings.max_video_seconds}s each, 1080p`, `Hasta ${settings.max_video_seconds}s cada uno, 1080p`),
                t(`Up to ${settings.max_tries_per_video} tries per video`, `Hasta ${settings.max_tries_per_video} intentos por video`),
                t("We write all the prompts", "Nosotros escribimos todos los prompts"),
              ].map((txt) => (
                <li key={txt} className="flex gap-2"><Check className="h-4 w-4 text-primary" />{txt}</li>
              ))}
            </ul>
            {action?.(p)}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CompareCost({ packages, settings }: { packages: Pkg[]; settings: Settings }) {
  const { t, lang } = useI18n();
  const hf = hfCostPerTry(settings);
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Option", "Opción")}</TableHead>
              <TableHead>{t("Cost per 30s 1080p video", "Costo por video de 30s en 1080p")}</TableHead>
              <TableHead>{t("Who writes prompts", "Quién escribe los prompts")}</TableHead>
              <TableHead>{t("Failed tries", "Intentos fallidos")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">{t("DIY on Higgsfield – Plus", "Por tu cuenta en Higgsfield – Plus")}</TableCell>
              <TableCell>{t("≈", "≈")} ${hf.plus.toFixed(0)} {t("per try", "por intento")} <span className="text-muted-foreground">({settings.hf_credits_per_30s} {t("credits", "créditos")}; ${settings.hf_plus_price} / {Number(settings.hf_plus_credits).toLocaleString("en-US")})</span></TableCell>
              <TableCell>{t("You", "Tú")}</TableCell>
              <TableCell>{t("You redo and pay again", "Tú rehaces y pagas de nuevo")}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">{t("DIY on Higgsfield – Ultra", "Por tu cuenta en Higgsfield – Ultra")}</TableCell>
              <TableCell>{t("≈", "≈")} ${hf.ultra.toFixed(0)} {t("per try", "por intento")} <span className="text-muted-foreground">(${settings.hf_ultra_price} / {Number(settings.hf_ultra_credits).toLocaleString("en-US")})</span></TableCell>
              <TableCell>{t("You", "Tú")}</TableCell>
              <TableCell>{t("You redo and pay again", "Tú rehaces y pagas de nuevo")}</TableCell>
            </TableRow>
            {packages.map((p) => (
              <TableRow key={p.id} className="bg-accent/50">
                <TableCell className="font-medium">{t("Us", "Nosotros")} – {pkgText(p.name, lang)}</TableCell>
                <TableCell>{perVideoPrice(p.price_label, p.videos) ?? p.price_label} {t("per finished video (1 credit)", "por video terminado (1 crédito)")}</TableCell>
                <TableCell>{t("Our team", "Nuestro equipo")}</TableCell>
                <TableCell>{t(`Up to ${settings.max_tries_per_video} tries included`, `Hasta ${settings.max_tries_per_video} intentos incluidos`)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          `Higgsfield: ${settings.hf_credits_per_30s} credits per 30s 1080p video at approximately ${Math.round(Number(settings.hf_plus_credits) / Number(settings.hf_plus_price))} credits per $1 — about $${hf.plus.toFixed(0)} per try. Our USD 9 per finished video is about half price. Figures are estimates based on configured credit pricing, not the billing mode used by our own production pipeline.`,
          `Higgsfield: ${settings.hf_credits_per_30s} créditos por video de 30s en 1080p a aproximadamente ${Math.round(Number(settings.hf_plus_credits) / Number(settings.hf_plus_price))} créditos por $1 — unos $${hf.plus.toFixed(0)} por intento. Nuestro precio de USD 9 por video terminado es casi la mitad. Las cifras son estimaciones basadas en el precio de créditos configurado, no en el modo de facturación de nuestro propio proceso de producción.`
        )}
      </p>
    </div>
  );
}
