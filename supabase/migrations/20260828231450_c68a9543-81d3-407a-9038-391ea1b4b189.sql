ALTER TABLE public.ebooks
  ADD COLUMN IF NOT EXISTS opening_video_provider text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS opening_video_id text,
  ADD COLUMN IF NOT EXISTS opening_video_aspect text NOT NULL DEFAULT 'portrait';

ALTER TABLE public.ebook_chapters
  ADD COLUMN IF NOT EXISTS video_provider text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS video_id text,
  ADD COLUMN IF NOT EXISTS video_aspect text NOT NULL DEFAULT 'portrait';

ALTER TABLE public.consultation_recordings
  ADD COLUMN IF NOT EXISTS video_provider text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS video_id text,
  ADD COLUMN IF NOT EXISTS video_aspect text NOT NULL DEFAULT 'landscape';