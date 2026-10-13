import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, StatusBadge } from "@/components/site";
import { brandTitle } from "@/lib/data";
import { ALL_STATUSES, SOURCE_LABELS, STATUS_LABELS, type SourceType } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/admin/jobs/")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Admin · Jobs") }] }),
  component: AdminJobs,
});

function AdminJobs() {
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [client, setClient] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const clients = useQuery({ queryKey: ["admin-profiles"], queryFn: async () => (await supabase.from("profiles").select("id,full_name,email,company").order("created_at")).data ?? [] });
  const jobs = useQuery({
    queryKey: ["admin-jobs", status, source, client, from, to, q],
    queryFn: async () => {
      let r = supabase.from("jobs").select("id,code,status,source_type,subject_name,user_id,created_at,try_number").order("created_at", { ascending: false }).limit(500);
      if (status !== "all") r = r.eq("status", status);
      if (source !== "all") r = r.eq("source_type", source);
      if (client !== "all") r = r.eq("user_id", client);
      if (from) r = r.gte("created_at", new Date(from).toISOString());
      if (to) r = r.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      if (q.trim()) r = r.or(`code.ilike.%${q.trim()}%,subject_name.ilike.%${q.trim()}%`);
      return (await r).data ?? [];
    },
  });
  const name = (id: string) => { const c = clients.data?.find((x) => x.id === id); return c?.company || c?.full_name || c?.email || "—"; };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Jobs</h1>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Input placeholder="Search code or subject" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent></Select>
        <Select value={source} onValueChange={setSource}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem>{Object.entries(SOURCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={client} onValueChange={setClient}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All clients</SelectItem>{clients.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.company || c.full_name || c.email}</SelectItem>)}</SelectContent></Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </div>
      {jobs.isLoading ? <Skeleton className="h-64" /> : jobs.data!.length === 0 ? <Empty title="No jobs match" /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Client</TableHead><TableHead>Subject</TableHead><TableHead>Source</TableHead><TableHead>Try</TableHead><TableHead>Created</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{jobs.data!.map((j) => (
              <TableRow key={j.id} className="cursor-pointer">
                <TableCell><Link to="/admin/jobs/$jobId" params={{ jobId: j.id }} className="font-medium text-primary">{j.code}</Link></TableCell>
                <TableCell>{name(j.user_id)}</TableCell><TableCell>{j.subject_name}</TableCell><TableCell>{SOURCE_LABELS[j.source_type as SourceType]}</TableCell><TableCell>{j.try_number}</TableCell>
                <TableCell>{format(new Date(j.created_at), "MMM d, HH:mm")}</TableCell><TableCell><StatusBadge status={j.status} /></TableCell>
              </TableRow>
            ))}</TableBody></Table>
        </div>
      )}
    </div>
  );
}
