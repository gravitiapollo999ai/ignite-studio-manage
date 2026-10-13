import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Car, Dumbbell, GraduationCap, Home, Link2, Scissors, ShoppingBag, Sparkles, Stethoscope, Utensils, Video, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark, SiteFooter, useSettings } from "@/components/site";
import { CompareCost, PackageCards } from "@/components/pricing-blocks";
import { packagesQuery } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";

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
  { icon: Link2, title: "Send a link or video", text: "Paste a TikTok, Reel or YouTube link you love — or upload your own MP4." },
  { icon: Wand2, title: "We adapt it to you", text: "Our team recreates the idea with your person, product or business, writing every prompt for you." },
  { icon: Video, title: "Receive finished videos", text: "Download ready-to-post 1080p videos, with a second try included if you need changes." },
];

const USE_CASES = [
  { icon: Utensils, label: "Restaurants" },
  { icon: Home, label: "Real estate" },
  { icon: Scissors, label: "Beauty & salons" },
  { icon: Dumbbell, label: "Fitness" },
  { icon: ShoppingBag, label: "E-commerce" },
  { icon: Stethoscope, label: "Clinics" },
  { icon: Car, label: "Automotive" },
  { icon: Building2, label: "Construction" },
  { icon: GraduationCap, label: "Education" },
];

function Landing() {
  const s = useSettings();
  const initial = Route.useLoaderData();
  const { data: packages = [] } = useQuery({ ...packagesQuery, initialData: initial });
  const { user } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <BrandMark />
          <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#use-cases" className="hover:text-foreground">Use cases</a>
            <a href="#packages" className="hover:text-foreground">Packages</a>
            <a href="#compare" className="hover:text-foreground">Compare</a>
          </nav>
          {user ? (
            <Button asChild size="sm"><Link to="/dashboard">Dashboard</Link></Button>
          ) : (
            <div className="flex gap-2">
              <Button asChild variant="ghost" size="sm"><Link to="/auth">Log in</Link></Button>
              <Button asChild size="sm"><Link to="/auth" search={{ mode: "signup" }}>Sign up</Link></Button>
            </div>
          )}
        </div>
      </header>

      <section className="relative overflow-hidden bg-hero-glow">
        <div className="mx-auto max-w-4xl px-4 py-24 text-center md:py-32">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Done-for-you AI video
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight md:text-6xl">Viral video ideas, remade for your business.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            {s.brand_name} takes any short video you like and turns it into finished 1080p videos starring your person, product or business. No prompts, no tools, no retries on your side.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg"><Link to="/auth" search={{ mode: "signup" }}>Get started</Link></Button>
            <Button asChild size="lg" variant="outline"><a href="#packages">See packages</a></Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">1 credit = 1 finished video · up to {s.max_video_seconds}s · 1080p</p>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl font-semibold">How it works</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((st, i) => (
            <div key={st.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-primary"><st.icon className="h-5 w-5" /></span>
                <span className="text-sm text-muted-foreground">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{st.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{st.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="use-cases" className="border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-semibold">Made for local and online businesses</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">Showcase your team, your dishes, your listings or your products in the formats people already watch — product demos, testimonials, before/after, trends and more.</p>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {USE_CASES.map((u) => (
              <div key={u.label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm font-medium">
                <u.icon className="h-5 w-5 text-primary" />{u.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="packages" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl font-semibold">Packages</h2>
        <p className="mt-3 text-muted-foreground">USD 9 per video credit. Minimum purchase: {s.min_package_videos} credits = USD {s.min_package_videos * 9}. 1 credit per video (up to {s.max_video_seconds}s, 1080p).</p>
        <div className="mt-10"><PackageCards packages={packages} settings={s} /></div>
      </section>

      <section id="compare" className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-3xl font-semibold">Compare the cost</h2>
        <p className="mt-3 text-muted-foreground">Doing it yourself means paying per try, writing the prompts and redoing failures. With us you pay per finished video.</p>
        <div className="mt-8"><CompareCost packages={packages} settings={s} /></div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-24 text-center">
        <div className="rounded-3xl border border-border bg-card p-10 bg-hero-glow">
          <h2 className="text-3xl font-semibold">Ready for your first videos?</h2>
          <p className="mt-3 text-muted-foreground">Create an account, request credits and send your first video in minutes.</p>
          <Button asChild size="lg" className="mt-6"><Link to="/auth" search={{ mode: "signup" }}>Sign up</Link></Button>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
