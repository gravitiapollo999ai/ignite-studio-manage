import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, StatusBadge } from "@/components/site";
import { brandTitle } from "@/lib/data";
import { ALL_STATUSES, SOURCE_LABELS, STATUS_LABELS, type SourceType } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/jobs/")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Your videos") }] }),
  component: JobsList,
});

function JobsList() {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const jobs = useQuery({
    queryKey: ["my-jobs", status, q],
    queryFn: async () => {
      let qry = supabase.from("jobs").select("id,code,status,subject_name,source_type,created_at,try_number").order("created_at", { ascending: false });
      if (status !== "all") qry = qry.eq("status", status);
      if (q.trim()) qry = qry.ilike("code", `%${q.trim()}%`);
      return (await qry).data ?? [];
    },
  });
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Your videos</h1><Button asChild><Link to="/jobs/new"><Plus className="h-4 w-4" />New video</Link></Button></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Search by code (JOB-000123)" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem>{ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent></Select>
      </div>
      {jobs.isLoading ? <Skeleton className="h-40" /> : jobs.data!.length === 0 ? <Empty title="No videos found" /> : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {jobs.data!.map((j) => (
            <Link key={j.id} to="/jobs/$jobId" params={{ jobId: j.id }} className="flex items-center justify-between gap-3 p-4 hover:bg-accent/40">
              <div className="min-w-0"><p className="font-medium">{j.code}</p><p className="truncate text-sm text-muted-foreground">{j.subject_name} · {SOURCE_LABELS[j.source_type as SourceType]} · {format(new Date(j.created_at), "MMM d")}</p></div>
              <StatusBadge status={j.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
