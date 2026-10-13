import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brandTitle, settingsQuery } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/api")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Admin · Production API") }] }),
  component: ApiPage,
});

function Code({ children }: { children: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-secondary p-4 text-xs"><code>{children}</code></pre>
      <Button size="icon" variant="ghost" className="absolute right-2 top-2" onClick={() => { navigator.clipboard.writeText(children); toast.success("Copied"); }} aria-label="Copy"><Copy className="h-4 w-4" /></Button>
    </div>
  );
}

function ApiPage() {
  const s = useQuery({ ...settingsQuery, staleTime: 0 });
  const [origin, setOrigin] = useState("https://your-app-url");
  useEffect(() => setOrigin(window.location.origin), []);
  const base = `${origin}/api/public/jobs-feed`;
  const last = s.data?.feed_last_success_at;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">Production feed API</h1>
        {last ? <Badge className="bg-success/20 text-foreground">Last successful call {formatDistanceToNow(new Date(last), { addSuffix: true })}</Badge> : <Badge variant="outline">Not verified — no successful call yet</Badge>}
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Pull-based feed for the production team. Each job includes its ID, code, specs, the source link or a 24h download link for the uploaded video, and a 24h download link for the client's subject reference image. Client emails and billing are never included. Authenticate with the <code>x-api-key</code> header using the <strong>JOBS_FEED_API_KEY</strong> secret (stored securely in your backend settings). This page does not connect to any production system by itself.
      </p>
      <Card><CardHeader><CardTitle>List jobs</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
        <p>Optional query params: <code>status</code> (e.g. submitted, in_review, revision) and <code>since</code> (ISO date, filters by last update).</p>
        <Code>{`curl -H "x-api-key: $JOBS_FEED_API_KEY" \\\n  "${base}?status=submitted&since=2026-01-01T00:00:00Z"`}</Code>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Update status</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
        <p>Allowed statuses: submitted, in_review, prompt_ready, generating, qa, delivered, revision, cancelled. The message is shown to the client.</p>
        <Code>{`curl -X POST -H "x-api-key: $JOBS_FEED_API_KEY" -H "Content-Type: application/json" \\\n  -d '{"job_id":"<uuid>","status":"generating","message":"Your video is being produced"}' \\\n  "${base}/status"`}</Code>
      </CardContent></Card>
    </div>
  );
}
