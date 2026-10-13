import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, RequestBadge, useSettings } from "@/components/site";
import { CompareCost, PackageCards } from "@/components/pricing-blocks";
import { balanceQuery, brandTitle, errMsg, packagesQuery } from "@/lib/data";
import { paymentProvider } from "@/lib/payments";

export const Route = createFileRoute("/_authenticated/credits")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Credits") }] }),
  component: Credits,
});

const REASON: Record<string, string> = { admin_grant: "Credits added", job_reserve: "Video ordered", job_refund: "Refund", adjustment: "Adjustment" };

function Credits() {
  const { user } = Route.useRouteContext();
  const s = useSettings();
  const qc = useQueryClient();
  const pkgs = useQuery(packagesQuery);
  const bal = useQuery(balanceQuery(user.id));
  const reqs = useQuery({ queryKey: ["my-requests"], queryFn: async () => (await supabase.from("credit_requests").select("*, packages(name)").order("created_at", { ascending: false })).data ?? [] });
  const ledger = useQuery({ queryKey: ["my-ledger"], queryFn: async () => (await supabase.from("credit_ledger").select("*, jobs(code)").order("created_at", { ascending: false }).limit(100)).data ?? [] });
  const [open, setOpen] = useState(false);
  const [pkgId, setPkgId] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const openFor = (id?: string) => { setPkgId(id ?? pkgs.data?.[0]?.id ?? ""); setMsg(""); setOpen(true); };

  async function submit() {
    const p = pkgs.data?.find((x) => x.id === pkgId);
    if (!p) return toast.error("Choose a package");
    if (msg.length > 1000) return toast.error("Message too long");
    setBusy(true);
    try {
      const r = await paymentProvider.start({ userId: user.id, packageId: p.id, credits: p.credits, message: msg.trim() });
      if (r.kind === "redirect") { window.location.href = r.url; return; }
      toast.success("Request sent — we'll confirm your credits shortly.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["my-requests"] });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold">Credits</h1>
          <p className="text-sm text-muted-foreground">Balance: <strong className="text-foreground">{bal.data ?? "…"}</strong> credits · USD 9 per credit · 1 credit per video (up to {s.max_video_seconds}s, 1080p) · Minimum purchase {s.min_package_videos} credits = USD {s.min_package_videos * 9}</p>
        </div>
        <Button onClick={() => openFor()}>Request credits</Button>
      </div>
      {pkgs.isLoading ? <Skeleton className="h-64" /> : (
        <PackageCards packages={pkgs.data ?? []} settings={s} action={(p) => <Button className="w-full" variant="outline" onClick={() => openFor(p.id)}>Request this package</Button>} />
      )}
      <section className="space-y-3"><h2 className="text-xl font-semibold">Compare the cost</h2><CompareCost packages={pkgs.data ?? []} settings={s} /></section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Requests</CardTitle></CardHeader>
          <CardContent>
            {reqs.data?.length === 0 ? <Empty title="No requests yet" /> : (
              <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Package</TableHead><TableHead>Credits</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{reqs.data?.map((r) => (
                  <TableRow key={r.id}><TableCell>{format(new Date(r.created_at), "MMM d")}</TableCell><TableCell>{r.packages?.name ?? "—"}{r.admin_note && <p className="text-xs text-muted-foreground">{r.admin_note}</p>}</TableCell><TableCell>{r.credits}</TableCell><TableCell><RequestBadge status={r.status} /></TableCell></TableRow>
                ))}</TableBody></Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Credit history</CardTitle></CardHeader>
          <CardContent>
            {ledger.data?.length === 0 ? <Empty title="No credit movements yet" /> : (
              <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Credits</TableHead></TableRow></TableHeader>
                <TableBody>{ledger.data?.map((l) => (
                  <TableRow key={l.id}><TableCell>{format(new Date(l.created_at), "MMM d")}</TableCell><TableCell>{REASON[l.reason]}{l.jobs?.code && ` · ${l.jobs.code}`}</TableCell><TableCell className={`text-right font-medium ${l.delta > 0 ? "text-success" : ""}`}>{l.delta > 0 ? `+${l.delta}` : l.delta}</TableCell></TableRow>
                ))}</TableBody></Table>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request credits</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Package</Label>
              <Select value={pkgId} onValueChange={setPkgId}><SelectTrigger><SelectValue placeholder="Choose a package" /></SelectTrigger>
                <SelectContent>{pkgs.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.price_label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-2"><Label>Message (optional)</Label><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={1000} placeholder="Anything we should know?" /></div>
            <p className="text-xs text-muted-foreground">We'll confirm payment details with you and add the credits once approved.</p>
          </div>
          <DialogFooter><Button onClick={submit} disabled={busy}>{busy ? "Sending…" : paymentProvider.ctaLabel}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
