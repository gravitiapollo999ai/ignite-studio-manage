-- Current pricing seed override. Apply after migrations on fresh environments.
-- Historical applied migrations are immutable; this is the current seed pricing.
UPDATE public.packages
SET price_label = 'USD ' || (videos * 9)::text, credits = videos
WHERE videos IN (10, 25, 50);

UPDATE public.settings
SET credits_per_video = 1,
    max_video_seconds = 30,
    min_package_videos = 10,
    hf_credits_per_30s = 330,
    hf_plus_credits = hf_plus_price * 19,
    hf_ultra_credits = hf_ultra_price * 19
WHERE id = 1;