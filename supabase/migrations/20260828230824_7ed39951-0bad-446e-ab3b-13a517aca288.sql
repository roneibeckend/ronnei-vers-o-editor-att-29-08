ALTER TABLE public.course_lessons
  ADD COLUMN IF NOT EXISTS video_provider text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS video_id text,
  ADD COLUMN IF NOT EXISTS video_aspect text NOT NULL DEFAULT 'landscape';

ALTER TABLE public.course_modules
  ADD COLUMN IF NOT EXISTS video_aspect text NOT NULL DEFAULT 'landscape';

DO $$ BEGIN
  ALTER TABLE public.course_lessons
    ADD CONSTRAINT course_lessons_video_provider_check
    CHECK (video_provider IN ('auto','bunny','youtube','drive','url'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.course_lessons
    ADD CONSTRAINT course_lessons_video_aspect_check
    CHECK (video_aspect IN ('landscape','portrait'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.course_modules
    ADD CONSTRAINT course_modules_video_aspect_check
    CHECK (video_aspect IN ('landscape','portrait'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;