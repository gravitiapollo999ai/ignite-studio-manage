-- STAGE B — DO NOT APPLY DURING BUILD. Apply via the migration tool only after the new Studio
-- reserve/commit UI is published and admin-checked (captain OK). Branding permissions are unchanged.

-- Table: rows are written only by service-role commit_final_upload.
REVOKE INSERT, DELETE ON public.deliverables FROM authenticated;
DROP POLICY IF EXISTS "deliv admin insert" ON public.deliverables;
DROP POLICY IF EXISTS "deliv admin delete" ON public.deliverables;

-- Storage: split the shared deliverables+branding admin policies (0000_migration.sql lines 350-355).
DROP POLICY IF EXISTS "admin storage insert" ON storage.objects;
DROP POLICY IF EXISTS "admin storage update" ON storage.objects;
DROP POLICY IF EXISTS "admin storage delete" ON storage.objects;

CREATE POLICY "branding admin insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND public.is_admin());
CREATE POLICY "branding admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND public.is_admin());
CREATE POLICY "branding admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND public.is_admin());

-- deliverables: INSERT only at a live reservation path owned by the uploader; no UPDATE (no overwrite/upsert); no client DELETE.
CREATE POLICY "deliverables reserved insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'deliverables' AND public.is_admin() AND EXISTS (
    SELECT 1 FROM public.final_upload_reservations r
    WHERE r.path = name AND r.status = 'reserved' AND r.expires_at > now() AND r.uploader = auth.uid()));
