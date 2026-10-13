import type { Database } from "@/integrations/supabase/types";

export type BusinessProfile = Database["public"]["Tables"]["business_profiles"]["Row"];

/** Field keys with English/Spanish labels, in display order. */
export const BUSINESS_FIELDS: Array<{ key: keyof BusinessProfile; en: string; es: string; long?: boolean; type?: string }> = [
  { key: "business_name", en: "Business name", es: "Nombre del negocio" },
  { key: "business_email", en: "Business email", es: "Correo del negocio", type: "email" },
  { key: "phone", en: "Phone / WhatsApp", es: "Teléfono / WhatsApp" },
  { key: "website", en: "Website", es: "Sitio web" },
  { key: "country", en: "Country", es: "País" },
  { key: "city", en: "City", es: "Ciudad" },
  { key: "industry", en: "Industry", es: "Industria" },
  { key: "description", en: "What your business does", es: "Qué hace tu negocio", long: true },
  { key: "target_audience", en: "Target audience", es: "Público objetivo", long: true },
  { key: "products_services", en: "Products / services", es: "Productos / servicios", long: true },
  { key: "brand_colors", en: "Brand colors", es: "Colores de marca" },
  { key: "instagram", en: "Instagram", es: "Instagram" },
  { key: "tiktok", en: "TikTok", es: "TikTok" },
  { key: "facebook", en: "Facebook", es: "Facebook" },
  { key: "youtube", en: "YouTube", es: "YouTube" },
];
