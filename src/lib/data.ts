import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Settings = Database["public"]["Tables"]["settings"]["Row"];
export type Pkg = Database["public"]["Tables"]["packages"]["Row"];
export type Job = Database["public"]["Tables"]["jobs"]["Row"];

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  brand_name: "Studio",
  logo_url: null,
  accent_color: "#0EA5A4",
  support_email: "support@example.com",
  credits_per_video: 1,
  max_video_seconds: 30,
  min_package_videos: 10,
  default_turnaround_hours: 72,
  max_tries_per_video: 2,
  hf_credits_per_30s: 330,
  hf_plus_price: 59,
  hf_plus_credits: 1121,
  hf_ultra_price: 129,
  hf_ultra_credits: 2451,
  feed_last_success_at: null,
  updated_at: new Date(0).toISOString(),
};

export async function fetchSettings(): Promise<Settings> {
  const { data } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  return data ?? DEFAULT_SETTINGS;
}

export const settingsQuery = queryOptions({ queryKey: ["settings"], queryFn: fetchSettings, staleTime: 60_000 });

export const packagesQuery = queryOptions({
  queryKey: ["packages", "active"],
  queryFn: async () => {
    const { data, error } = await supabase.from("packages").select("*").eq("active", true).order("sort_order");
    if (error) throw error;
    return data;
  },
});

export const balanceQuery = (userId: string) =>
  queryOptions({
    queryKey: ["balance", userId],
    queryFn: async () => {
      const { data } = await supabase.from("credit_balances").select("balance").eq("user_id", userId).maybeSingle();
      return data?.balance ?? 0;
    },
  });

export function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return "Something went wrong";
}

export async function signedUrl(bucket: string, path: string, expires = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expires);
  if (error) throw error;
  return data.signedUrl;
}

export function brandTitle(matches: Array<{ loaderData?: unknown }>, page: string) {
  const root = matches[0]?.loaderData as { settings?: Settings } | undefined;
  const brand = root?.settings?.brand_name ?? "Studio";
  return `${page} · ${brand}`;
}
