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

// Placeholder/example support addresses must never be shown to clients.
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  const e = email.trim().toLowerCase();
  return e.endsWith("@example.com") || e.endsWith("@example.org") || e.endsWith("@example.net") || e.endsWith(".test");
}

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

export const LIMIT_30_EN = "For now, videos are limited to 30 seconds. Longer videos are coming soon. Please submit a reel or clip of 30s or less.";
export const LIMIT_30_ES = "Por ahora, los videos tienen un límite de 30 segundos. Pronto aceptaremos videos más largos. Envía un reel o clip de 30 s o menos.";

/** Known backend/auth messages → [English, Spanish]. Anything unknown becomes a generic, translated message
 *  (raw technical errors are logged to the console, never shown to users). */
const KNOWN: Array<[RegExp, string, string]> = [
  [/insufficient credits/i, "You don't have enough credits.", "No tienes créditos suficientes."],
  [/balance cannot go below zero/i, "The balance can't go below zero.", "El saldo no puede quedar por debajo de cero."],
  [/note required|reason required/i, "A note is required.", "Se requiere una nota."],
  [/amount cannot be zero/i, "Amount can't be zero.", "La cantidad no puede ser cero."],
  [/admins or managers only|admins only|row-level security|permission denied/i, "You don't have permission to do that.", "No tienes permiso para hacer eso."],
  [/cannot remove the last admin/i, "You can't remove the last admin.", "No puedes quitar al último administrador."],
  [/user not found/i, "User not found.", "Usuario no encontrado."],
  [/not signed in|jwt|session|unauthorized/i, "Your session expired. Please sign in again.", "Tu sesión expiró. Vuelve a iniciar sesión."],
  [/invalid login credentials/i, "Wrong email or password.", "Correo o contraseña incorrectos."],
  [/email not confirmed/i, "Please confirm your email first.", "Primero confirma tu correo."],
  [/user already registered/i, "That email is already registered.", "Ese correo ya está registrado."],
  [/password should be|weak password/i, "Password is too weak (min. 6 characters).", "La contraseña es muy débil (mín. 6 caracteres)."],
  [/same.*password|different from the old/i, "Use a different password than your current one.", "Usa una contraseña distinta a la actual."],
  [/rate limit|too many/i, "Too many attempts. Please wait a minute.", "Demasiados intentos. Espera un minuto."],
  [/source video longer than 30 seconds/i, LIMIT_30_EN, LIMIT_30_ES],
  [/source video length unverified/i, "We couldn't read your video's length. Please upload a standard MP4 again.", "No pudimos leer la duración de tu video. Vuelve a subir un MP4 estándar."],
  [/clip segment required/i, "For regular YouTube videos, enter a start and end of 30 seconds or less.", "Para videos normales de YouTube, indica un inicio y un final de 30 segundos o menos."],
  [/duration must be between/i, "Video length is out of range.", "La duración del video está fuera de rango."],
  [/reference image required/i, "Upload a reference image of the subject.", "Sube una imagen de referencia del sujeto."],
  [/source link required/i, "Paste a video link.", "Pega un enlace de video."],
  [/invalid source file/i, "Upload your video again.", "Vuelve a subir tu video."],
  [/subject name required/i, "Enter the subject name.", "Ingresa el nombre del sujeto."],
  [/no tries left/i, "No tries left for this video.", "No quedan intentos para este video."],
  [/only delivered jobs/i, "Only delivered videos can be revised.", "Solo se pueden revisar videos entregados."],
  [/request (already decided|not pending)/i, "This request was already decided.", "Esta solicitud ya fue resuelta."],
  [/payload too large|exceeded the maximum|too large/i, "The file is too large.", "El archivo es demasiado grande."],
  [/failed to fetch|network/i, "Connection problem. Check your internet and try again.", "Problema de conexión. Revisa tu internet e inténtalo de nuevo."],
];

export function friendlyError(raw: string, lang: "en" | "es"): string {
  const hit = KNOWN.find(([re]) => re.test(raw));
  if (hit) return lang === "es" ? hit[2] : hit[1];
  return lang === "es" ? "Algo salió mal. Inténtalo de nuevo." : "Something went wrong. Please try again.";
}

export function errMsg(e: unknown): string {
  const raw = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : String(e ?? "");
  if (raw) console.error("[app error]", raw);
  const lang = typeof document !== "undefined" && document.documentElement.lang === "es" ? "es" : "en";
  return friendlyError(raw, lang);
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
