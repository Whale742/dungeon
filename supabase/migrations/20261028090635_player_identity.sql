-- Phase 1. Server-only identity storage; never expose credential rows to clients.
-- Rollback (after disabling identity routes and backing up accounts):
-- DROP FUNCTION public.game_identity(text,jsonb); DROP TABLE public.game_player_sessions; DROP TABLE public.game_players;
CREATE TABLE public.game_players (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 display_name text NOT NULL DEFAULT '冒險者' CHECK (char_length(display_name) BETWEEN 1 AND 24),
 username text UNIQUE CHECK (username ~ '^[a-z0-9_]{3,24}$'),
 password_hash text,
 recovery_hash text,
 auth_version integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((username IS NULL AND password_hash IS NULL AND recovery_hash IS NULL) OR (username IS NOT NULL AND password_hash IS NOT NULL AND recovery_hash IS NOT NULL))
);
CREATE TABLE public.game_player_sessions (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 player_id uuid NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
 auth_version integer NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_player_sessions_player_idx ON public.game_player_sessions(player_id);
CREATE INDEX game_player_sessions_expiry_idx ON public.game_player_sessions(expires_at);
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_player_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_players, public.game_player_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_players, public.game_player_sessions TO service_role;

CREATE FUNCTION public.game_identity(action text, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE p public.game_players; result jsonb;
BEGIN
 IF action = 'create' THEN
  INSERT INTO public.game_players DEFAULT VALUES RETURNING * INTO p;
 ELSIF action = 'username' THEN
  SELECT * INTO p FROM public.game_players WHERE username = payload->>'username';
 ELSIF action = 'session' THEN
  SELECT to_jsonb(g) || jsonb_build_object('expires', extract(epoch FROM s.expires_at)*1000) INTO result
   FROM public.game_player_sessions s JOIN public.game_players g ON g.id=s.player_id
   WHERE s.token_hash=payload->>'hash' AND s.expires_at>now() AND s.auth_version=g.auth_version;
  RETURN result;
 ELSIF action = 'issue' THEN
  SELECT * INTO p FROM public.game_players WHERE id=(payload->>'id')::uuid FOR UPDATE;
  IF p.id IS NULL OR p.auth_version<>(payload->>'version')::integer THEN RETURN NULL; END IF;
  DELETE FROM public.game_player_sessions WHERE player_id=p.id AND expires_at<=now();
  INSERT INTO public.game_player_sessions(token_hash,player_id,auth_version,expires_at)
   VALUES(payload->>'hash',p.id,p.auth_version,to_timestamp((payload->>'expires')::double precision/1000));
 ELSIF action = 'revoke' THEN
  DELETE FROM public.game_player_sessions WHERE token_hash=payload->>'hash'; RETURN 'true'::jsonb;
 ELSIF action = 'name' THEN
  UPDATE public.game_players SET display_name=payload->>'name' WHERE id=(payload->>'id')::uuid RETURNING * INTO p;
 ELSIF action = 'credentials' THEN
  SELECT * INTO p FROM public.game_players WHERE id=(payload->>'id')::uuid FOR UPDATE;
  IF p.id IS NULL OR p.auth_version<>(payload->>'version')::integer OR (p.username IS NOT NULL AND p.username<>payload->>'username') THEN RETURN NULL; END IF;
  UPDATE public.game_players SET username=payload->>'username',password_hash=payload->>'password',recovery_hash=payload->>'recovery',auth_version=auth_version+1 WHERE id=p.id RETURNING * INTO p;
  DELETE FROM public.game_player_sessions WHERE player_id=p.id;
 ELSIF action = 'player' THEN
  SELECT * INTO p FROM public.game_players WHERE id=(payload->>'id')::uuid;
 ELSE RAISE EXCEPTION 'Unknown identity operation';
 END IF;
 IF p.id IS NULL THEN RETURN NULL; END IF;
 RETURN to_jsonb(p);
END;
$$;
REVOKE ALL ON FUNCTION public.game_identity(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.game_identity(text,jsonb) TO service_role;
