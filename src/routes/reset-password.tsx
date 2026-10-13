import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/site";
import { brandTitle } from "@/lib/data";

export const Route = createFileRoute("/reset-password")({
  head: ({ matches }) => {
    const t = brandTitle(matches, "Choose a new password");
    return { meta: [{ title: t }, { name: "description", content: "Set a new password for your account." }, { property: "og:title", content: t }, { property: "og:description", content: "Set a new password for your account." }] };
  },
  component: Reset,
});

function Reset() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = String(f.get("password") ?? "");
    if (pw.length < 6) return toast.error("At least 6 characters");
    if (pw !== f.get("confirm")) return toast.error("Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    nav({ to: "/dashboard" });
  }
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center"><BrandMark /></div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h1 className="text-xl font-semibold">Choose a new password</h1>
          <div className="space-y-2"><Label htmlFor="p">New password</Label><Input id="p" name="password" type="password" required /></div>
          <div className="space-y-2"><Label htmlFor="c">Confirm password</Label><Input id="c" name="confirm" type="password" required /></div>
          <Button className="w-full" disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
        </form>
      </div>
    </div>
  );
}
