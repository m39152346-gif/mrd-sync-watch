DROP POLICY IF EXISTS "rooms creatable" ON public.rooms;
DROP POLICY IF EXISTS "rooms readable" ON public.rooms;
REVOKE INSERT, UPDATE, DELETE ON public.rooms FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.sw_room_exists(_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.rooms WHERE code = upper(_code));
$$;
GRANT EXECUTE ON FUNCTION public.sw_room_exists(text) TO anon, authenticated, service_role;