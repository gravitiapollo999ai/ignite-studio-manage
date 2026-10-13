import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { brandTitle, errMsg, settingsQuery } from "@/lib/data";
import { hfCostPerTry } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Admin · Settings") }] }),
  component: SettingsPage,
});

const num = z.coerce.number().positive();
const schema = z.object({
  brand_name: z.string().trim().min(1).max(60),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #0EA5A4"),
  support_email: z.string().trim().email(),
  credits_per_video: z.coerce.number().int().positive(),
  max_video_seconds: z.coerce.number().int().min(5).max(60),
  min_package_videos: z.coerce.number().int().positive(),
  default_turnaround_hours: z.coerce.number().int().positive(),
  max_tries_per_video: z.coerce.number().int().min(1).max(2),
  hf_credits_per_30s: num, hf_plus_price: num, hf_plus_credits: num, hf_ultra_price: num, hf_ultra_credits: num,
});

function SettingsPage() {
  const qc = useQueryClient();
  const s = useQuery({ ...settingsQuery, staleTime: 0 });
  const [busy, setBusy] = useState(false);
  if (!s.data) return <Skeleton className="h-96" />;
  const hf = hfCostPerTry(s.data);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!p.success) return toast.error(`${p.error.issues[0].path[0]}: ${p.error.issues[0].message}`);
    setBusy(true);
    const { error } = await supabase.from("settings").update(p.data).eq("id", 1);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  async function uploadLogo(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/") || f.size > 5 * 1024 * 1024) return toast.error("Use an image under 5 MB");
    try {
      const path = `logo-${Date.now()}.${f.name.split(".").pop()}`;
      const up = await supabase.storage.from("branding").upload(path, f, { contentType: f.type });
      if (up.error) throw up.error;
      const { data, error } = await supabase.storage.from("branding").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (error) throw error;
      const r = await supabase.from("settings").update({ logo_url: data.signedUrl }).eq("id", 1);
      if (r.error) throw r.error;
      toast.success("Logo updated");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) { toast.error(errMsg(e)); }
  }
  async function removeLogo() {
    await supabase.from("settings").update({ logo_url: null }).eq("id", 1);
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  const F = ({ name, label, type = "text", step }: { name: keyof typeof s.data; label: string; type?: string; step?: string }) => (
    <div className="space-y-1"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={type} step={step} defaultValue={String(s.data![name] ?? "")} /></div>
  );

  return (
    <form onSubmit={save} className="space-y-6" key={s.data.updated_at}>
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Settings</h1><Button disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button></div>
      <Card><CardHeader><CardTitle>Branding</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
        <F name="brand_name" label="Brand name" />
        <F name="support_email" label="Support email" type="email" />
        <div className="space-y-1"><Label htmlFor="accent_color">Accent color</Label><div className="flex gap-2"><Input id="accent_color" name="accent_color" defaultValue={s.data.accent_color} /><input type="color" defaultValue={s.data.accent_color} onChange={(e) => { (document.getElementById("accent_color") as HTMLInputElement).value = e.target.value; }} className="h-9 w-12 rounded border border-input" aria-label="Pick color" /></div></div>
        <div className="space-y-1"><Label>Logo</Label><div className="flex items-center gap-3">{s.data.logo_url && <img src={s.data.logo_url} alt="Logo" className="h-10 w-auto rounded" />}<Input type="file" accept="image/*" onChange={(e) => uploadLogo(e.target.files?.[0])} />{s.data.logo_url && <Button type="button" variant="ghost" size="sm" onClick={removeLogo}>Remove</Button>}</div></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Pricing & production</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3">
        <F name="credits_per_video" label="Credits per video" type="number" />
        <F name="max_video_seconds" label="Max video length (s)" type="number" />
        <F name="min_package_videos" label="Minimum package (videos)" type="number" />
        <F name="default_turnaround_hours" label="Turnaround (hours)" type="number" />
        <F name="max_tries_per_video" label="Max tries per video" type="number" />
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Higgsfield comparison (estimates)</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-5">
          <F name="hf_credits_per_30s" label="Credits per 30s video" type="number" step="any" />
          <F name="hf_plus_price" label="Plus price ($)" type="number" step="any" />
          <F name="hf_plus_credits" label="Plus credits" type="number" step="any" />
          <F name="hf_ultra_price" label="Ultra price ($)" type="number" step="any" />
          <F name="hf_ultra_credits" label="Ultra credits" type="number" step="any" />
        </div>
        <p className="text-sm text-muted-foreground">Current estimate: ≈ ${hf.plus.toFixed(2)} per try on Plus, ≈ ${hf.ultra.toFixed(2)} on Ultra. Display-only figures based on configured credit pricing — they don't affect your production pipeline or its billing.</p>
      </CardContent></Card>
    </form>
  );
}
