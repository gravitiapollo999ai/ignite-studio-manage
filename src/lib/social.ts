export type SocialProvider = "tiktok" | "instagram" | "facebook" | "youtube";

/** Live OAuth/posting is enabled per provider only once its developer app credentials are configured and approved. */
export const SOCIAL_PROVIDERS: Array<{ id: SocialProvider; name: string; live: boolean; later?: boolean }> = [
  { id: "tiktok", name: "TikTok", live: false },
  { id: "instagram", name: "Instagram", live: false },
  { id: "facebook", name: "Facebook", live: false, later: true },
  { id: "youtube", name: "YouTube", live: false, later: true },
];

export const POSTABLE: SocialProvider[] = ["tiktok", "instagram"];
