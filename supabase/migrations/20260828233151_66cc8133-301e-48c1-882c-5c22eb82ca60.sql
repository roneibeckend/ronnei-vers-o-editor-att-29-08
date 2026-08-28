ALTER TABLE public.consultation_recordings
  DROP COLUMN IF EXISTS video_provider,
  DROP COLUMN IF EXISTS video_id,
  DROP COLUMN IF EXISTS video_aspect;