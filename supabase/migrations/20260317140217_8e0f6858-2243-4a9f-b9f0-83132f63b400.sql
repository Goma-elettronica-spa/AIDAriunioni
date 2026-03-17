
-- Remove duplicates first: keep only the most recent assignment per area
DELETE FROM public.user_functional_areas a
USING public.user_functional_areas b
WHERE a.functional_area_id = b.functional_area_id
  AND a.created_at < b.created_at;

-- Add unique constraint: one user per functional area
ALTER TABLE public.user_functional_areas
  ADD CONSTRAINT unique_area_one_user UNIQUE (functional_area_id);
