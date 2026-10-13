import { Check } from "lucide-react";
import type { Pkg, Settings } from "@/lib/data";
import { hfCostPerTry, perVideoPrice } from "@/lib/pricing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function PackageCards({ packages, settings, action }: { packages: Pkg[]; settings: Settings; action?: (p: Pkg) => React.ReactNode }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {packages.map((p, i) => (
        <Card key={p.id} className={i === 1 ? "border-primary shadow-lg" : ""}>
          <CardHeader>
            <CardTitle className="text-lg">{p.name}</CardTitle>
            <p className="text-3xl font-semibold font-display">{p.price_label}</p>
            <p className="text-sm text-muted-foreground">{p.credits} credits · {perVideoPrice(p.price_label, p.videos) ?? "—"} per video</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
            <ul className="space-y-1.5 text-sm">
              {[`${p.videos} finished videos`, `Up to ${settings.max_video_seconds}s each, 1080p`, `Up to ${settings.max_tries_per_video} tries per video`, "We write all the prompts"].map((t) => (
                <li key={t} className="flex gap-2"><Check className="h-4 w-4 text-primary" />{t}</li>
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
  const hf = hfCostPerTry(settings);
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Option</TableHead>
              <TableHead>Cost per 30s 1080p video</TableHead>
              <TableHead>Who writes prompts</TableHead>
              <TableHead>Failed tries</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">DIY on Higgsfield – Plus</TableCell>
              <TableCell>≈ ${hf.plus.toFixed(0)} per try <span className="text-muted-foreground">({settings.hf_credits_per_30s} credits; ${settings.hf_plus_price} / {Number(settings.hf_plus_credits).toLocaleString()})</span></TableCell>
              <TableCell>You</TableCell>
              <TableCell>You redo and pay again</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">DIY on Higgsfield – Ultra</TableCell>
              <TableCell>≈ ${hf.ultra.toFixed(0)} per try <span className="text-muted-foreground">(${settings.hf_ultra_price} / {Number(settings.hf_ultra_credits).toLocaleString()})</span></TableCell>
              <TableCell>You</TableCell>
              <TableCell>You redo and pay again</TableCell>
            </TableRow>
            {packages.map((p) => (
              <TableRow key={p.id} className="bg-accent/50">
                <TableCell className="font-medium">Us – {p.name}</TableCell>
                <TableCell>{perVideoPrice(p.price_label, p.videos) ?? p.price_label} per finished video (1 credit)</TableCell>
                <TableCell>Our team</TableCell>
                <TableCell>Up to {settings.max_tries_per_video} tries included</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Higgsfield figures are estimates based on configured credit pricing (Seedance, 30s at 1080p). They are not the billing mode used by our own production pipeline.
      </p>
    </div>
  );
}
