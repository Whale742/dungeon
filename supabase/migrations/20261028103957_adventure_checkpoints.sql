-- Phase 2: one authoritative checkpoint per adventure; metadata never rewrites progress.
-- Rollback only after stopping the game service and backing up checkpoints:
-- DROP FUNCTION public.game_adventure(text,jsonb);
-- DROP TABLE public.game_adventure_members; DROP TABLE public.game_adventures;
CREATE TABLE public.game_adventures (
 id uuid PRIMARY KEY,
 leader_id uuid NOT NULL REFERENCES public.game_players(id),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','failed','abandoned')),
 save_version bigint NOT NULL DEFAULT 0 CHECK (save_version >= 0),
 checkpoint_floor integer,
 checkpoint_state text CHECK (checkpoint_state IS NULL OR checkpoint_state='CHOOSING_ROUTE'),
 checkpoint_key uuid,
 checkpoint jsonb,
 saved_at timestamptz,
 ended_at timestamptz,
 lease_owner uuid NOT NULL,
 lease_generation bigint NOT NULL DEFAULT 1,
 lease_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((save_version=0 AND checkpoint IS NULL) OR
        (save_version>0 AND checkpoint IS NOT NULL AND checkpoint_floor>0 AND checkpoint_state='CHOOSING_ROUTE' AND saved_at IS NOT NULL))
);
CREATE TABLE public.game_adventure_members (
 adventure_id uuid NOT NULL REFERENCES public.game_adventures(id) ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES public.game_players(id),
 joined_at timestamptz NOT NULL DEFAULT now(),
 left_at timestamptz,
 PRIMARY KEY(adventure_id,player_id)
);
CREATE INDEX game_adventure_members_player_idx ON public.game_adventure_members(player_id,adventure_id) WHERE left_at IS NULL;
ALTER TABLE public.game_adventures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_adventure_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_adventures,public.game_adventure_members FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.game_adventures,public.game_adventure_members TO service_role;

CREATE FUNCTION public.game_adventure(action text,payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.game_adventures; member_id uuid; result jsonb; stamp timestamptz := clock_timestamp();
BEGIN
 IF action IN ('save','finish','leave') AND (payload->>'version')::bigint=0 THEN
  INSERT INTO public.game_adventures(id,leader_id,lease_owner,lease_until)
   VALUES((payload->>'id')::uuid,(payload->>'leaderId')::uuid,(payload->>'owner')::uuid,stamp+interval '60 seconds')
   ON CONFLICT(id) DO NOTHING;
  IF FOUND THEN
   FOR member_id IN SELECT value::uuid FROM jsonb_array_elements_text(payload->'members') LOOP
    INSERT INTO public.game_adventure_members(adventure_id,player_id) VALUES((payload->>'id')::uuid,member_id);
   END LOOP;
  END IF;
 END IF;
 SELECT * INTO a FROM public.game_adventures WHERE id=(payload->>'id')::uuid FOR UPDATE;
 IF a.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
 IF action IN ('load','claim') THEN
  IF NOT EXISTS(SELECT 1 FROM public.game_adventure_members WHERE adventure_id=a.id AND player_id=(payload->>'playerId')::uuid AND left_at IS NULL)
   THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
  IF a.status<>'active' THEN RETURN jsonb_build_object('error','ENDED'); END IF;
  IF a.checkpoint IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
  IF action='claim' THEN
   IF a.lease_until>stamp AND a.lease_owner<>(payload->>'owner')::uuid THEN RETURN jsonb_build_object('error','BUSY'); END IF;
   UPDATE public.game_adventures SET lease_generation=a.lease_generation+CASE WHEN a.lease_owner<>(payload->>'owner')::uuid THEN 1 ELSE 0 END,
    lease_owner=(payload->>'owner')::uuid,lease_until=stamp+interval '60 seconds' WHERE id=a.id RETURNING * INTO a;
  END IF;
 ELSE
  IF a.status<>'active' THEN
   IF action='finish' AND a.status=payload->>'status' AND a.lease_owner=(payload->>'owner')::uuid THEN
    RETURN to_jsonb(a)-'checkpoint';
   END IF;
   RETURN jsonb_build_object('error','ENDED');
  END IF;
  IF a.lease_owner IS DISTINCT FROM (payload->>'owner')::uuid OR a.lease_generation IS DISTINCT FROM (payload->>'generation')::bigint OR a.lease_until<=stamp
   THEN RETURN jsonb_build_object('error','CONFLICT'); END IF;
  IF action='save' THEN
   IF a.checkpoint_key IS DISTINCT FROM (payload->>'key')::uuid THEN
    IF a.save_version IS DISTINCT FROM (payload->>'version')::bigint OR payload->>'key' IS NULL THEN RETURN jsonb_build_object('error','CONFLICT'); END IF;
    IF payload->'snapshot'->>'adventureId' IS DISTINCT FROM a.id::text OR payload->'snapshot'->>'checkpointState' IS DISTINCT FROM 'CHOOSING_ROUTE' OR
       (payload->'snapshot'->>'schemaVersion')::int IS DISTINCT FROM 1 OR jsonb_typeof(payload->'snapshot'->'data'->'players') IS DISTINCT FROM 'object'
     THEN RAISE EXCEPTION 'Invalid checkpoint schema'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(payload->'snapshot'->'data'->'memberIds') m(value)
      WHERE NOT EXISTS(SELECT 1 FROM public.game_adventure_members gm WHERE gm.adventure_id=a.id AND gm.player_id=m.value::uuid AND gm.left_at IS NULL))
     THEN RETURN jsonb_build_object('error','CONFLICT'); END IF;
    UPDATE public.game_adventures SET checkpoint=payload->'snapshot',checkpoint_key=(payload->>'key')::uuid,
     checkpoint_floor=(payload->'snapshot'->'data'->>'floor')::integer,checkpoint_state='CHOOSING_ROUTE',
     save_version=a.save_version+1,saved_at=stamp,leader_id=(payload->>'leaderId')::uuid,
     lease_until=stamp+interval '60 seconds' WHERE id=a.id RETURNING * INTO a;
   ELSIF a.checkpoint<>payload->'snapshot' THEN RETURN jsonb_build_object('error','CONFLICT');
   ELSE UPDATE public.game_adventures SET lease_until=stamp+interval '60 seconds' WHERE id=a.id RETURNING * INTO a;
   END IF;
  ELSIF action='renew' THEN
   UPDATE public.game_adventures SET lease_until=stamp+interval '60 seconds' WHERE id=a.id RETURNING * INTO a;
  ELSIF action='release' THEN
   UPDATE public.game_adventures SET lease_until=stamp WHERE id=a.id RETURNING * INTO a;
  ELSIF action='finish' THEN
   IF a.save_version IS DISTINCT FROM (payload->>'version')::bigint OR payload->>'status' IS NULL OR payload->>'status' NOT IN ('completed','failed','abandoned')
    THEN RETURN jsonb_build_object('error','CONFLICT'); END IF;
   UPDATE public.game_adventures SET status=payload->>'status',ended_at=stamp WHERE id=a.id RETURNING * INTO a;
  ELSIF action='leave' THEN
   UPDATE public.game_adventure_members SET left_at=stamp WHERE adventure_id=a.id AND player_id=(payload->>'playerId')::uuid AND left_at IS NULL;
   IF NOT EXISTS(SELECT 1 FROM public.game_adventure_members WHERE adventure_id=a.id AND left_at IS NULL) THEN
    UPDATE public.game_adventures SET status='abandoned',ended_at=stamp WHERE id=a.id RETURNING * INTO a;
   ELSIF a.leader_id=(payload->>'playerId')::uuid THEN
    UPDATE public.game_adventures SET leader_id=(SELECT player_id FROM public.game_adventure_members WHERE adventure_id=a.id AND left_at IS NULL ORDER BY joined_at,player_id LIMIT 1)
     WHERE id=a.id RETURNING * INTO a;
   END IF;
  ELSE RAISE EXCEPTION 'Unknown adventure operation'; END IF;
 END IF;
 result := to_jsonb(a);
 IF action NOT IN ('load','claim') THEN result := result-'checkpoint'; END IF;
 SELECT result||jsonb_build_object('members',coalesce(jsonb_agg(player_id ORDER BY joined_at,player_id),'[]'::jsonb)) INTO result
  FROM public.game_adventure_members WHERE adventure_id=a.id AND left_at IS NULL;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.game_adventure(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.game_adventure(text,jsonb) TO service_role;
