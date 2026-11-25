CREATE TABLE public.room_owner_credentials (room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE, secret_hash text NOT NULL);
GRANT ALL ON public.room_owner_credentials TO service_role;
ALTER TABLE public.room_owner_credentials ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sw_is_host(_room uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.participants p WHERE p.id = public.sw_member_id(_room) AND p.is_host) $$;

CREATE OR REPLACE FUNCTION public.sw_review(_room uuid, _participant uuid, _approve boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.sw_is_host(_room) THEN RAISE EXCEPTION 'Only the host can review' USING ERRCODE='42501'; END IF;
  UPDATE public.participants SET admission_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END
  WHERE id=_participant AND room_id=_room AND admission_status='pending';
END $$;

CREATE OR REPLACE FUNCTION public.sw_kick(_room uuid, _participant uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.sw_is_host(_room) THEN RAISE EXCEPTION 'Only the host can remove viewers' USING ERRCODE='42501'; END IF;
  UPDATE public.participants SET admission_status='rejected', last_seen_at=now()-interval '1 day'
  WHERE id=_participant AND room_id=_room AND NOT is_host;
END $$;

CREATE OR REPLACE FUNCTION public.sw_owner_link(_room uuid, _secret text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.sw_is_host(_room) THEN RAISE EXCEPTION 'Only the host' USING ERRCODE='42501'; END IF;
  IF _secret !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid secret'; END IF;
  INSERT INTO public.room_owner_credentials(room_id, secret_hash) VALUES (_room, encode(sha256(convert_to(_secret,'UTF8')),'hex'))
  ON CONFLICT (room_id) DO UPDATE SET secret_hash = EXCLUDED.secret_hash;
END $$;

-- Moves the host seat (or an account's approved seat) onto this browser's key.
CREATE OR REPLACE FUNCTION public.sw_rebind(_room uuid, _target uuid, _key text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old uuid;
BEGIN
  SELECT participant_id INTO old FROM public.room_access_credentials WHERE room_id=_room AND key_hash=_key;
  IF old = _target THEN RETURN; END IF;
  IF old IS NOT NULL THEN
    DELETE FROM public.room_access_credentials WHERE participant_id=old;
    DELETE FROM public.participants WHERE id=old AND admission_status='pending';
  END IF;
  UPDATE public.room_access_credentials SET key_hash=_key WHERE participant_id=_target;
END $$;
REVOKE ALL ON FUNCTION public.sw_rebind(uuid,uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sw_claim_host(_code text, _secret text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid; host uuid; h text := public.sw_key_hash();
BEGIN
  IF h IS NULL OR _secret !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  SELECT o.room_id INTO r FROM public.room_owner_credentials o JOIN public.rooms ro ON ro.id=o.room_id
  WHERE ro.code=upper(_code) AND o.secret_hash=encode(sha256(convert_to(_secret,'UTF8')),'hex');
  IF r IS NULL THEN RETURN false; END IF;
  SELECT id INTO host FROM public.participants WHERE room_id=r AND is_host ORDER BY created_at LIMIT 1;
  IF host IS NULL THEN RETURN false; END IF;
  PERFORM public.sw_rebind(r, host, h);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.sw_create(_code text, _name text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid := gen_random_uuid(); p uuid := gen_random_uuid(); h text := public.sw_key_hash();
BEGIN
  IF h IS NULL OR _code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' OR char_length(trim(_name)) NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'Invalid request'; END IF;
  INSERT INTO public.rooms(id,code,host_session) VALUES(r,_code,p::text);
  INSERT INTO public.participants(id,room_id,session_token,display_name,is_host,admission_status,user_id) VALUES(p,r,p::text,trim(_name),true,'approved',auth.uid());
  INSERT INTO public.room_access_credentials VALUES(p,r,h);
  INSERT INTO public.room_event_credentials(room_id) VALUES(r);
  INSERT INTO public.player_state(room_id) VALUES(r);
  RETURN jsonb_build_object('room_id',r,'code',_code);
END $$;

CREATE OR REPLACE FUNCTION public.sw_enter(_code text, _name text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid; p uuid; mine uuid; h text := public.sw_key_hash();
BEGIN
  IF h IS NULL OR char_length(trim(_name)) NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'Invalid request'; END IF;
  SELECT id INTO r FROM public.rooms WHERE code=upper(_code);
  IF r IS NULL THEN RETURN jsonb_build_object('status','missing'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.room_event_credentials WHERE room_id=r) THEN RETURN jsonb_build_object('status','legacy'); END IF;
  PERFORM 1 FROM public.rooms WHERE id=r FOR UPDATE;
  SELECT participant_id INTO p FROM public.room_access_credentials WHERE room_id=r AND key_hash=h;
  -- A signed-in account keeps its seat (approved, host or removed) across devices.
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO mine FROM public.participants WHERE room_id=r AND user_id=auth.uid() AND admission_status IN ('approved','rejected') ORDER BY is_host DESC, created_at LIMIT 1;
    IF mine IS NOT NULL THEN PERFORM public.sw_rebind(r, mine, h); RETURN jsonb_build_object('room_id',r); END IF;
  END IF;
  IF p IS NULL THEN
    IF (SELECT count(*) FROM public.participants WHERE room_id=r AND admission_status='pending') >= 100 THEN RAISE EXCEPTION 'Room queue full'; END IF;
    p := gen_random_uuid();
    INSERT INTO public.participants(id,room_id,session_token,display_name,admission_status,user_id) VALUES(p,r,p::text,trim(_name),'pending',auth.uid());
    INSERT INTO public.room_access_credentials VALUES(p,r,h);
  END IF;
  RETURN jsonb_build_object('room_id',r);
END $$;

CREATE OR REPLACE FUNCTION public.sw_snapshot(_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid; p uuid; s text; topic text; viewers jsonb; pending jsonb; playback jsonb; host boolean;
BEGIN
  SELECT id INTO r FROM public.rooms WHERE code=upper(_code);
  IF r IS NULL THEN RETURN jsonb_build_object('status','missing'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.room_event_credentials WHERE room_id=r) THEN RETURN jsonb_build_object('status','legacy'); END IF;
  SELECT c.participant_id, v.admission_status, v.is_host INTO p, s, host FROM public.room_access_credentials c JOIN public.participants v ON v.id=c.participant_id WHERE c.room_id=r AND c.key_hash=public.sw_key_hash();
  IF p IS NULL THEN RETURN jsonb_build_object('status','unknown'); END IF;
  IF s <> 'approved' THEN RETURN jsonb_build_object('status',s,'room_id',r,'member_id',p); END IF;
  SELECT e.topic INTO topic FROM public.room_event_credentials e WHERE e.room_id=r;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'color',color,'is_host',is_host,'last_seen_at',last_seen_at,'online', id=p OR last_seen_at > now()-interval '75 seconds') ORDER BY is_host DESC, created_at),'[]') INTO viewers FROM public.participants WHERE room_id=r AND admission_status='approved';
  IF host THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name) ORDER BY created_at),'[]') INTO pending FROM public.participants WHERE room_id=r AND admission_status='pending';
  ELSE pending := '[]'; END IF;
  SELECT to_jsonb(ps) INTO playback FROM public.player_state ps WHERE room_id=r;
  RETURN jsonb_build_object('status',s,'room_id',r,'member_id',p,'is_host',host,'topic',topic,'participants',viewers,'requests',pending,'state',playback,'server_time',now());
END $$;

CREATE OR REPLACE FUNCTION public.sw_hosted_rooms(_codes text[]) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(ro.code), '{}') FROM public.rooms ro
  JOIN public.room_access_credentials c ON c.room_id=ro.id AND c.key_hash=public.sw_key_hash()
  JOIN public.participants p ON p.id=c.participant_id AND p.is_host AND p.admission_status='approved'
  WHERE ro.code = ANY(_codes[1:20]) $$;

CREATE OR REPLACE FUNCTION public.sw_delete_room(_code text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid;
BEGIN
  SELECT id INTO r FROM public.rooms WHERE code=upper(_code);
  IF r IS NULL OR NOT public.sw_is_host(r) THEN RETURN false; END IF;
  DELETE FROM public.messages WHERE room_id=r;
  DELETE FROM public.player_state WHERE room_id=r;
  DELETE FROM public.room_event_credentials WHERE room_id=r;
  DELETE FROM public.room_access_credentials WHERE room_id=r;
  DELETE FROM public.room_owner_credentials WHERE room_id=r;
  DELETE FROM public.participants WHERE room_id=r;
  DELETE FROM public.rooms WHERE id=r;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.sw_is_host(uuid), public.sw_kick(uuid,uuid), public.sw_owner_link(uuid,text), public.sw_claim_host(text,text), public.sw_hosted_rooms(text[]), public.sw_delete_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sw_is_host(uuid), public.sw_kick(uuid,uuid), public.sw_owner_link(uuid,text), public.sw_claim_host(text,text), public.sw_hosted_rooms(text[]), public.sw_delete_room(text) TO anon, authenticated, service_role;