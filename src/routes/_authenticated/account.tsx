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
import { brandTitle } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/account")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Account") }] }),
  component: Account,
});

const schema = z.object({ full_name: z.string().trim().min(1, "Name required").max(100), company: z.string().trim().max(100), phone: z.string().trim().max(40) });

function Account() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const prof = useQuery({ queryKey: ["profile", user.id], queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()).data });
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!p.success) return toast.error(p.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.from("profiles").update(p.data).eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  }
  async function changePw(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = String(f.get("password") ?? "");
    if (pw.length < 6) return toast.error("At least 6 characters");
    if (pw !== f.get("confirm")) return toast.error("Passwords don't match");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast.error(error.message);
    toast.success("Password changed");
    e.currentTarget.reset();
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      <Card><CardHeader><CardTitle>Profile</CardTitle></CardHeader><CardContent>
        {prof.isLoading ? <Skeleton className="h-48" /> : (
          <form onSubmit={save} className="space-y-4" key={prof.data?.id}>
            <div className="space-y-2"><Label>Email</Label><Input value={user.email ?? ""} disabled /></div>
            <div className="space-y-2"><Label htmlFor="fn">Full name</Label><Input id="fn" name="full_name" defaultValue={prof.data?.full_name ?? ""} /></div>
            <div className="space-y-2"><Label htmlFor="co">Company</Label><Input id="co" name="company" defaultValue={prof.data?.company ?? ""} /></div>
            <div className="space-y-2"><Label htmlFor="ph">Phone</Label><Input id="ph" name="phone" defaultValue={prof.data?.phone ?? ""} /></div>
            <Button disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </form>
        )}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Change password</CardTitle></CardHeader><CardContent>
        <form onSubmit={changePw} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="np">New password</Label><Input id="np" name="password" type="password" /></div>
          <div className="space-y-2"><Label htmlFor="cp">Confirm</Label><Input id="cp" name="confirm" type="password" /></div>
          <Button>Update password</Button>
        </form>
      </CardContent></Card>
    </div>
  );
}
