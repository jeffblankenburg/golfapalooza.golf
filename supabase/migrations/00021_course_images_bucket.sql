-- Create the course-images storage bucket for hole overhead and green contour images
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-images', 'course-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read images
CREATE POLICY "Anyone can view course images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'course-images');

-- Allow admins to upload/update/delete images
CREATE POLICY "Admins can manage course images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'course-images'
  AND EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND is_admin = true)
);

CREATE POLICY "Admins can update course images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'course-images'
  AND EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND is_admin = true)
);

CREATE POLICY "Admins can delete course images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'course-images'
  AND EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND is_admin = true)
);
