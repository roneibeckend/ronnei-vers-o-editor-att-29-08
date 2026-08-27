ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS affiliate_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.ebooks ADD COLUMN IF NOT EXISTS affiliate_enabled boolean NOT NULL DEFAULT true;