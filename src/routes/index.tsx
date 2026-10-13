import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Car, Dumbbell, GraduationCap, Home, Link2, Scissors, ShoppingBag, Sparkles, Stethoscope, Utensils, Video, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark, SiteFooter, useSettings } from "@/components/site";
import { CompareCost, PackageCards, ComingSoonButton } from "@/components/pricing-blocks";
import { packagesQuery } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { HeaderControls } from "@/components/header-controls";

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(packagesQuery),
  head: ({ matches }) => {
    const brand = (matches[0]?.loaderData as { settings?: { brand_name: string } } | undefined)?.settings?.brand_name ?? "Studio";
    const title = `${brand} — Done-for-you AI videos for your business`;
    const description = "Send a link or a video. We adapt it to your business with your person or product and deliver finished 1080p videos.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: Landing,
});

const STEPS = [
  {
    icon: Link2,
    title: { en: "Send a link or video", es: "Envía un enlace o video" },
    text: {
      en: "Paste a TikTok, Reel or YouTube link you love — or upload your own MP4.",
      es: "Pega un enlace de TikTok, Reel o YouTube que te guste, o sube tu propio MP4.",
    },
  },
  {
    icon: Wand2,
    title: { en: "We adapt it to you", es: "Lo adaptamos a ti" },
    text: {
      en: "Our team recreates the idea with your person, product or business, writing every prompt for you.",
      es: "Nuestro equipo recrea la idea con tu sujeto, producto o negocio, escribiendo cada prompt por ti.",
    },
  },
  {
    icon: Video,
    title: { en: "Receive finished videos", es: "Recibe videos terminados" },
    text: {
      en: "Download ready-to-post 1080p videos, with a second try included if you need changes.",
      es: "Descarga videos en 1080p listos para publicar, con un segundo intento incluido si necesitas cambios.",
    },
  },
];

const USE_CASES = [
  { icon: Utensils, label: { en: "Restaurants", es: "Restaurantes" } },
  { icon: Home, label: { en: "Real estate", es: "Bienes raíces" } },
  { icon: Scissors, label: { en: "Beauty & salons", es: "Belleza y salones" } },
  { icon: Dumbbell, label: { en: "Fitness", es: "Fitness" } },
  { icon: ShoppingBag, label: { en: "E-commerce", es: "Comercio electrónico" } },
  { icon: Stethoscope, label: { en: "Clinics", es: "Clínicas" } },
  { icon: Car, label: { en: "Automotive", es: "Automotriz" } },
  { icon: Building2, label: { en: "Construction", es: "Construcción" } },
  { icon: GraduationCap, label: { en: "Education", es: "Educación" } },
];

function Landing() {
  const s = useSettings();
  const initial = Route.useLoaderData();
  const { data: packages = [] } = useQuery({ ...packagesQuery, initialData: initial });
  const { user } = useAuth();
  const { t } = useI18n();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <BrandMark />
          <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">{t("How it works", "Cómo funciona")}</a>
            <a href="#use-cases" className="hover:text-foreground">{t("Use cases", "Casos de uso")}</a>
            <a href="#packages" className="hover:text-foreground">{t("Packages", "Paquetes")}</a>
            <a href="#compare" className="hover:text-foreground">{t("Compare", "Comparar")}</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button asChild size="sm"><Link to="/dashboard">{t("Dashboard", "Panel")}</Link></Button>
            ) : (
              <div className="flex gap-2">
                <Button asChild variant="ghost" size="sm"><Link to="/auth">{t("Log in", "Iniciar sesión")}</Link></Button>
                <Button asChild size="sm"><Link to="/auth" search={{ mode: "signup" }}>{t("Sign up", "Registrarse")}</Link></Button>
              </div>
            )}
            <HeaderControls />
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-hero-glow">
        <div className="mx-auto max-w-4xl px-4 py-24 text-center md:py-32">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> {t("Done-for-you AI video", "Video con IA hecho para ti")}
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight md:text-6xl">{t("Viral video ideas, remade for your business.", "Ideas de video virales, recreadas para tu negocio.")}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            {t(
              `${s.brand_name} takes any short video you like and turns it into finished 1080p videos starring your person, product or business. No prompts, no tools, no retries on your side.`,
              `${s.brand_name} toma cualquier video corto que te guste y lo convierte en videos terminados en 1080p protagonizados por tu sujeto, producto o negocio. Sin prompts, sin herramientas, sin reintentos de tu parte.`
            )}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg"><Link to="/auth" search={{ mode: "signup" }}>{t("Get started", "Comenzar")}</Link></Button>
            <Button asChild size="lg" variant="outline"><a href="#packages">{t("See packages", "Ver paquetes")}</a></Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{t(`1 credit = 1 finished video · up to ${s.max_video_seconds}s · 1080p`, `1 crédito = 1 video terminado · hasta ${s.max_video_seconds}s · 1080p`)}</p>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl font-semibold">{t("How it works", "Cómo funciona")}</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((st, i) => (
            <div key={st.title.en} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-primary"><st.icon className="h-5 w-5" /></span>
                <span className="text-sm text-muted-foreground">{t(`Step ${i + 1}`, `Paso ${i + 1}`)}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{t(st.title.en, st.title.es)}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t(st.text.en, st.text.es)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="use-cases" className="border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-semibold">{t("Made for local and online businesses", "Hecho para negocios locales y en línea")}</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">{t("Showcase your team, your dishes, your listings or your products in the formats people already watch — product demos, testimonials, before/after, trends and more.", "Muestra a tu equipo, tus platillos, tus propiedades o tus productos en los formatos que la gente ya ve: demostraciones de producto, testimonios, antes/después, tendencias y más.")}</p>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {USE_CASES.map((u) => (
              <div key={u.label.en} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm font-medium">
                <u.icon className="h-5 w-5 text-primary" />{t(u.label.en, u.label.es)}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="packages" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl font-semibold">{t("Packages", "Paquetes")}</h2>
        <p className="mt-3 text-muted-foreground">{t(`USD 9 per video credit. Minimum purchase: ${s.min_package_videos} credits = USD ${s.min_package_videos * 9}. 1 credit per video (up to ${s.max_video_seconds}s, 1080p).`, `USD 9 por crédito de video. Compra mínima: ${s.min_package_videos} créditos = USD ${s.min_package_videos * 9}. 1 crédito por video (hasta ${s.max_video_seconds}s, 1080p).`)}</p>
        <div className="mt-10"><PackageCards packages={packages} settings={s} action={() => <ComingSoonButton />} /></div>
      </section>

      <section id="compare" className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-3xl font-semibold">{t("Compare the cost", "Compara el costo")}</h2>
        <p className="mt-3 text-muted-foreground">{t("Doing it yourself means paying per try, writing the prompts and redoing failures. With us you pay per finished video.", "Hacerlo tú mismo significa pagar por intento, escribir los prompts y rehacer los fallos. Con nosotros pagas por video terminado.")}</p>
        <div className="mt-8"><CompareCost packages={packages} settings={s} /></div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-24 text-center">
        <div className="rounded-3xl border border-border bg-card p-10 bg-hero-glow">
          <h2 className="text-3xl font-semibold">{t("Ready for your first videos?", "¿Listo para tus primeros videos?")}</h2>
          <p className="mt-3 text-muted-foreground">{t("Create an account, request credits and send your first video in minutes.", "Crea una cuenta, solicita créditos y envía tu primer video en minutos.")}</p>
          <Button asChild size="lg" className="mt-6"><Link to="/auth" search={{ mode: "signup" }}>{t("Sign up", "Registrarse")}</Link></Button>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
