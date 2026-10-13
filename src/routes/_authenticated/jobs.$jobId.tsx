import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, StatusBadge, useSettings } from "@/components/site";
import { JobTimeline } from "@/components/job-timeline";
import { brandTitle, errMsg, signedUrl } from "@/lib/data";
import { SOURCE_LABELS, formatMmSs, type SourceType } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Video details") }] }),
  component: JobDetail,
});

function JobDetail() {
  const { jobId } = Route.useParams();
  const s = useSettings();
  const qc = useQueryClient();
  const job = useQuery({ queryKey: ["job", jobId], queryFn: async () => (await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle()).data });
  const events = useQuery({ queryKey: ["job-events", jobId], queryFn: async () => (await supabase.from("job_events").select("id,status,message,created_at").eq("job_id", jobId).order("created_at")).data ?? [] });
  const files = useQuery({ queryKey: ["deliverables", jobId], queryFn: async () => (await supabase.from("deliverables").select("*").eq("job_id", jobId).order("created_at", { ascending: false })).data ?? [] });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (job.isLoading) return <Skeleton className="h-96" />;
  const j = job.data;
  if (!j) return <Empty title="Video not found"><Link to="/jobs" className="text-primary">Back to videos</Link></Empty>;

  async function download(path: string, name: string) {
    try { const u = await signedUrl("deliverables", path, 600); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  async function revise() {
    if (!reason.trim()) return toast.error("Tell us what to change");
    setBusy(true);
    const { error } = await supabase.rpc("request_revision", { _job_id: j!.id, _reason: reason.trim().slice(0, 1000) });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Revision requested");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["job", jobId] });
    qc.invalidateQueries({ queryKey: ["job-events", jobId] });
  }
  const canRevise = j.status === "delivered" && j.try_number < Math.min(2, s.max_tries_per_video);

  return (
    <div className="space-y-6">
      <Link to="/jobs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />All videos</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{j.code}</h1><p className="text-sm text-muted-foreground">Ordered {format(new Date(j.created_at), "MMM d, yyyy")}</p></div>
        <StatusBadge status={j.status} />
      </div>
      <Card><CardHeader><CardTitle>Progress</CardTitle></CardHeader><CardContent>
        <JobTimeline status={j.status} tryNumber={j.try_number} maxTries={Math.min(2, s.max_tries_per_video)} events={events.data ?? []} />
      </CardContent></Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Your videos</CardTitle>{canRevise && <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Request revision</Button>}</CardHeader>
        <CardContent>
          {files.data?.length === 0 ? <Empty title="Not ready yet">Your finished videos will appear here.</Empty> : (
            <div className="divide-y divide-border">{files.data?.map((f) => (
              <div key={f.id} className="flex items-center justify-between py-3"><div><p className="font-medium">{f.file_name}</p><p className="text-xs text-muted-foreground">Try {f.try_number} · {format(new Date(f.created_at), "MMM d")}</p></div>
                <Button size="sm" onClick={() => download(f.file_path, f.file_name)}><Download className="h-4 w-4" />Download</Button></div>
            ))}</div>
          )}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Order details</CardTitle></CardHeader><CardContent>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row k="Source" v={SOURCE_LABELS[j.source_type as SourceType]} />
          {j.source_url && <Row k="Link" v={<a href={j.source_url} target="_blank" rel="noreferrer" className="break-all text-primary">{j.source_url}</a>} />}
          {(j.clip_start != null || j.clip_end != null) && <Row k="Clip" v={`${formatMmSs(j.clip_start) || "0:00"} – ${formatMmSs(j.clip_end) || "end"}`} />}
          <Row k="Length" v={`${j.target_duration_seconds}s · 1080p`} />
          <Row k="Subject" v={`${j.subject_name} (${j.subject_type})`} />
          <Row k="Business type" v={j.business_type ?? "—"} />
          <Row k="Credits" v={String(j.estimated_credits)} />
          <Row k="Turnaround" v={`${j.estimated_turnaround_hours}h`} />
          {j.notes && <div className="sm:col-span-2"><dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap">{j.notes}</dd></div>}
        </dl>
      </CardContent></Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>Request revision (try 2 of 2)</DialogTitle></DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What should we change?" maxLength={1000} />
          <DialogFooter><Button onClick={revise} disabled={busy}>{busy ? "Sending…" : "Request revision"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>;
}
