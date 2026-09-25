-- Profiles for optional full accounts
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Viewer',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile write" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Rooms
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  host_session text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms readable" ON public.rooms FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "rooms creatable" ON public.rooms FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Participants (guests and logged-in users)
CREATE TABLE public.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  session_token text NOT NULL,
  display_name text NOT NULL,
  color text NOT NULL DEFAULT '#22d3ee',
  user_id uuid,
  is_host boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, session_token)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO anon, authenticated;
GRANT ALL ON public.participants TO service_role;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants readable" ON public.participants FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "participants insertable" ON public.participants FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "participants updatable" ON public.participants FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "participants deletable" ON public.participants FOR DELETE TO anon, authenticated USING (true);

-- Shared playback state (one row per room)
CREATE TABLE public.player_state (
  room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'none',
  source_ref text,
  source_title text,
  is_playing boolean NOT NULL DEFAULT false,
  position_seconds double precision NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
GRANT SELECT, INSERT, UPDATE ON public.player_state TO anon, authenticated;
GRANT ALL ON public.player_state TO service_role;
ALTER TABLE public.player_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player_state readable" ON public.player_state FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "player_state insertable" ON public.player_state FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "player_state updatable" ON public.player_state FOR UPDATE TO anon, authenticated USING (true);

-- Chat
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  color text NOT NULL DEFAULT '#22d3ee',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_room_created_idx ON public.messages (room_id, created_at);
GRANT SELECT, INSERT ON public.messages TO anon, authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages readable" ON public.messages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "messages insertable" ON public.messages FOR INSERT TO anon, authenticated WITH CHECK (char_length(body) BETWEEN 1 AND 2000);

ALTER PUBLICATION supabase_realtime ADD TABLE public.player_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
ALTER TABLE public.player_state REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;