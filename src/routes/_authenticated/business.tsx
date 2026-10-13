import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { brandTitle, signedUrl } from "@/lib/data";
import { BUSINESS_FIELDS } from "@/lib/business";
import { BUSINESS_TYPES, BUSINESS_TYPES_ES } from "@/lib/pricing";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/business")({
  validateSearch: (s: Record<string, unknown>) => ({ onboarding: s.onboarding === true || s.onboarding === "true" || undefined }),
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Business profile") }] }),
  component: Business,
});

const str = (max: number) => z.string().trim().max(max);

function Business() {
  const { user } = Route.useRouteContext();
  const { onboarding } = Route.useSearch();
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const bp = useQuery({ queryKey: ["business", user.id], queryFn: async () => (await supabase.from("business_profiles").select("*").eq("user_id", user.id).maybeSingle()).data });
  const [busy, setBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (bp.data?.logo_path) signedUrl("business-logos", bp.data.logo_path, 3600).then(setLogoUrl).catch(() => {});
  }, [bp.data?.logo_path]);

  const schema = z.object({
    business_name: str(120).min(1, t("Business name required", "El nombre del negocio es obligatorio")),
    business_email: z.union([z.literal(""), z.string().trim().email(t("Invalid business email", "Correo del negocio inválido"))]),
    phone: str(40), website: str(200), country: str(80), city: str(80), industry: str(80),
    description: str(2000), target_audience: str(1000), products_services: str(2000), brand_colors: str(200),
    instagram: str(120), tiktok: str(120), facebook: str(200), youtube: str(200),
  });

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!p.success) return toast.error(p.error.issues[0].message);
    setBusy(true);
    let logo_path = bp.data?.logo_path ?? null;
    if (file) {
      if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type) || file.size > 5 * 1024 * 1024) { setBusy(false); return toast.error(t("Logo must be PNG, JPG, WEBP or SVG up to 5 MB", "El logo debe ser PNG, JPG, WEBP o SVG de hasta 5 MB")); }
      logo_path = `${user.id}/logo-${Date.now()}.${file.name.split(".").pop()}`;
      const up = await supabase.storage.from("business-logos").upload(logo_path, file, { upsert: true });
      if (up.error) { setBusy(false); return toast.error(up.error.message); }
    }
    const row = { ...p.data, user_id: user.id, logo_path, completed: true };
    const { error } = await supabase.from("business_profiles").upsert(row);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("Business profile saved", "Perfil del negocio guardado"));
    qc.invalidateQueries({ queryKey: ["business", user.id] });
    if (onboarding) nav({ to: "/dashboard" });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("Business profile", "Perfil del negocio")}</h1>
        <p className="text-sm text-muted-foreground">{onboarding ? t("Welcome! Tell us about your business so every video fits your brand.", "¡Bienvenido! Cuéntanos sobre tu negocio para que cada video encaje con tu marca.") : t("We use this to adapt every video to your business.", "Usamos esta información para adaptar cada video a tu negocio.")}</p>
      </div>
      <Card><CardHeader><CardTitle>{t("Your business", "Tu negocio")}</CardTitle></CardHeader><CardContent>
        {bp.isLoading ? <Skeleton className="h-96" /> : (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" key={bp.data?.updated_at ?? "new"}>
            {BUSINESS_FIELDS.map((f) => {
              const val = (bp.data?.[f.key] as string | null) ?? "";
              const id = `bp-${f.key}`;
              return (
                <div key={f.key} className={f.long ? "space-y-2 sm:col-span-2" : "space-y-2"}>
                  <Label htmlFor={id}>{lang === "es" ? f.es : f.en}</Label>
                  {f.long ? <Textarea id={id} name={f.key} defaultValue={val} rows={3} />
                    : f.key === "industry" ? (
                      <><Input id={id} name={f.key} defaultValue={val} list="industries" /><datalist id="industries">{BUSINESS_TYPES.map((b) => <option key={b} value={lang === "es" ? BUSINESS_TYPES_ES[b] ?? b : b} />)}</datalist></>
                    ) : <Input id={id} name={f.key} type={f.type ?? "text"} defaultValue={val} placeholder={["instagram", "tiktok"].includes(f.key) ? "@" : undefined} />}
                </div>
              );
            })}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bp-logo">{t("Logo", "Logo")}</Label>
              {logoUrl && <img src={logoUrl} alt={t("Business logo", "Logo del negocio")} className="h-16 w-16 rounded-md border border-border object-contain" />}
              <Input id="bp-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button disabled={busy}>{busy ? t("Saving…", "Guardando…") : t("Save", "Guardar")}</Button>
              {onboarding && <Button type="button" variant="ghost" onClick={() => nav({ to: "/dashboard" })}>{t("Skip for now", "Omitir por ahora")}</Button>}
            </div>
          </form>
        )}
      </CardContent></Card>
    </div>
  );
}
