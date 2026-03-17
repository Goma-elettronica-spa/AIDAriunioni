ALTER TABLE public.slide_uploads 
ADD COLUMN functional_area_id uuid REFERENCES public.functional_areas(id) ON DELETE SET NULL;