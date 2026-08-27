-- 1) Hide paid content links from regular authenticated users (column-level privileges)
REVOKE SELECT (content_url) ON public.courses FROM authenticated;
REVOKE SELECT (content_url) ON public.courses FROM anon;
REVOKE SELECT (content_url) ON public.ebooks FROM authenticated;
REVOKE SELECT (content_url) ON public.ebooks FROM anon;
REVOKE SELECT (video_url) ON public.ebooks FROM authenticated;
REVOKE SELECT (video_url) ON public.ebooks FROM anon;

GRANT ALL ON public.courses TO service_role;
GRANT ALL ON public.ebooks TO service_role;

-- 2) Storage: exact object-path match instead of weak LIKE suffix match
DROP POLICY IF EXISTS recipe_videos_read_published ON storage.objects;

CREATE POLICY recipe_videos_read_published
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'recipe-videos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.recipes r
      WHERE r.is_published = true
        AND r.video_url IS NOT NULL
        AND (
          split_part(r.video_url, '?', 1) = objects.name
          OR split_part(split_part(r.video_url, '?', 1), '/recipe-videos/', 2) = objects.name
        )
    )
  )
);
