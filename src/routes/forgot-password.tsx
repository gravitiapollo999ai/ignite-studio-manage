import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/site";
import { brandTitle } from "@/lib/data";

export const Route = createFileRoute("/forgot-password")({
  head: ({ matches }) => {
    const t = brandTitle(matches, "Reset password");
    return { meta: [{ title: t }, { name: "description", content: "Get a link to reset your password." }, { property: "og:title", content: t }, { property: "og:description", content: "Get a link to reset your password." }] };
  },
  component: Forgot,
});

function Forgot() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = z.string().trim().email().safeParse(new FormData(e.currentTarget).get("email"));
    if (!email.success) return toast.error("Enter a valid email");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSent(true);
    toast.success("Reset link sent");
  }
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center"><BrandMark /></div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-xl font-semibold">Reset your password</h1>
          {sent ? (
            <p className="mt-3 text-sm text-muted-foreground">If an account exists, you'll get an email with a reset link shortly.</p>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-4">
              <div className="space-y-2"><Label htmlFor="e">Email</Label><Input id="e" name="email" type="email" required /></div>
              <Button className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
            </form>
          )}
          <Link to="/auth" className="mt-4 block text-center text-sm text-muted-foreground hover:text-foreground">Back to log in</Link>
        </div>
      </div>
    </div>
  );
}
