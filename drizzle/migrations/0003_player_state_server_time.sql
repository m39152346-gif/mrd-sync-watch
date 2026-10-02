CREATE OR REPLACE FUNCTION public.player_state_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.player_state_touch() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS player_state_touch ON public.player_state;
CREATE TRIGGER player_state_touch BEFORE INSERT OR UPDATE ON public.player_state
FOR EACH ROW EXECUTE FUNCTION public.player_state_touch();