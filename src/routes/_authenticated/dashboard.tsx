import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, RequestBadge, StatusBadge } from "@/components/site";
import { balanceQuery, brandTitle } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Dashboard") }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const bal = useQuery(balanceQuery(user.id));
  const reqs = useQuery({
    queryKey: ["my-requests", "pending"],
    queryFn: async () => (await supabase.from("credit_requests").select("*, packages(name)").eq("status", "pending").order("created_at", { ascending: false })).data ?? [],
  });
  const jobs = useQuery({
    queryKey: ["my-jobs", "recent"],
    queryFn: async () => (await supabase.from("jobs").select("id,code,status,subject_name,created_at,try_number").order("created_at", { ascending: false }).limit(6)).data ?? [],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-2">
          <Button asChild><Link to="/jobs/new"><Plus className="h-4 w-4" />New video</Link></Button>
          <Button asChild variant="outline"><Link to="/credits">Request credits</Link></Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-hero-glow">
          <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-sm text-muted-foreground">Credit balance</CardTitle><Wallet className="h-4 w-4 text-primary" /></CardHeader>
          <CardContent>
            {bal.isLoading ? <Skeleton className="h-10 w-20" /> : <p className="font-display text-4xl font-semibold">{bal.data}</p>}
            <p className="text-sm text-muted-foreground">1 credit = 1 finished video</p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Pending credit requests</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {reqs.isLoading ? <Skeleton className="h-8" /> : reqs.data!.length === 0 ? <p className="text-sm text-muted-foreground">No pending requests.</p> : reqs.data!.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span>{r.packages?.name ?? "Credits"} · {r.credits} credits</span>
                <span className="flex items-center gap-2 text-muted-foreground">{format(new Date(r.created_at), "MMM d")}<RequestBadge status={r.status} /></span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Recent videos</CardTitle><Link to="/jobs" className="text-sm text-primary">View all</Link></CardHeader>
        <CardContent>
          {jobs.isLoading ? <Skeleton className="h-24" /> : jobs.data!.length === 0 ? (
            <Empty title="No videos yet">Start by sending a link or uploading a video.</Empty>
          ) : (
            <div className="divide-y divide-border">
              {jobs.data!.map((j) => (
                <Link key={j.id} to="/jobs/$jobId" params={{ jobId: j.id }} className="flex items-center justify-between py-3 hover:bg-accent/40">
                  <div><p className="font-medium">{j.code}</p><p className="text-sm text-muted-foreground">{j.subject_name} · {format(new Date(j.created_at), "MMM d, yyyy")}</p></div>
                  <StatusBadge status={j.status} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
