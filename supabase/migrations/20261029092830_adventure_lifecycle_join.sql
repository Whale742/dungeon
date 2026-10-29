-- Strict route checkpoints: terminal rows are irreversible tombstones.
-- Stop old server instances before applying; deploy this RPC before the new server.
ALTER TABLE public.game_adventures DROP CONSTRAINT game_adventures_check;
ALTER TABLE public.game_adventures ADD CONSTRAINT game_adventures_check CHECK (
 (status <> 'active' AND checkpoint IS NULL AND checkpoint_key IS NULL AND checkpoint_floor IS NULL AND checkpoint_state IS NULL)
 OR (status = 'active' AND ((save_version=0 AND checkpoint IS NULL) OR
 (save_version>0 AND checkpoint IS NOT NULL AND checkpoint_floor>0 AND checkpoint_state='CHOOSING_ROUTE' AND saved_at IS NOT NULL)))
) NOT VALID;
UPDATE public.game_adventures SET checkpoint=NULL,checkpoint_key=NULL,checkpoint_floor=NULL,checkpoint_state=NULL WHERE status<>'active';
DELETE FROM public.game_adventure_members WHERE adventure_id IN (SELECT id FROM public.game_adventures WHERE status<>'active');
ALTER TABLE public.game_adventures VALIDATE CONSTRAINT game_adventures_check;

CREATE OR REPLACE FUNCTION public.game_adventure(action text,payload jsonb DEFAULT '{}'::jsonb)
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
  IF a.status<>'active' THEN RETURN jsonb_build_object('error','ENDED'); END IF;
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
  IF a.lease_owner IS DISTINCT FROM (payload->>'owner')::uuid OR a.lease_generation IS DISTINCT FROM (payload->>'generation')::bigint OR (a.lease_until<=stamp AND action<>'finish')
   THEN RETURN jsonb_build_object('error','CONFLICT'); END IF;
  IF action='save' THEN
   IF a.checkpoint_key IS DISTINCT FROM (payload->>'key')::uuid THEN
    IF a.save_version IS DISTINCT FROM (payload->>'version')::bigint OR payload->>'key' IS NULL THEN RETURN jsonb_build_object('error','CONFLICT'); END IF;
    IF payload->'snapshot'->>'adventureId' IS DISTINCT FROM a.id::text OR payload->'snapshot'->>'checkpointState' IS DISTINCT FROM 'CHOOSING_ROUTE' OR
       (payload->'snapshot'->>'schemaVersion')::int IS DISTINCT FROM 1 OR jsonb_typeof(payload->'snapshot'->'data'->'players') IS DISTINCT FROM 'object'
     THEN RAISE EXCEPTION 'Invalid checkpoint schema'; END IF;
    -- Membership and progress commit under the same adventure row lock/CAS.
    -- Only the leased service instance may admit characters at a route boundary.
    IF jsonb_array_length(payload->'members') > 10 OR
       payload->'members' IS DISTINCT FROM payload->'snapshot'->'data'->'memberIds' OR
       (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(payload->'members')) <> jsonb_array_length(payload->'members') OR
       EXISTS(SELECT 1 FROM public.game_adventure_members gm WHERE gm.adventure_id=a.id AND gm.left_at IS NULL
        AND NOT (payload->'members' ? gm.player_id::text))
     THEN RETURN jsonb_build_object('error','CONFLICT'); END IF;
    FOR member_id IN SELECT value::uuid FROM jsonb_array_elements_text(payload->'members') LOOP
     IF NOT (payload->'snapshot'->'data'->'players' ? member_id::text) THEN RAISE EXCEPTION 'Missing character'; END IF;
     INSERT INTO public.game_adventure_members(adventure_id,player_id) VALUES(a.id,member_id)
      ON CONFLICT(adventure_id,player_id) DO UPDATE SET left_at=NULL;
    END LOOP;
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
   IF (payload->>'version') IS NULL OR (payload->>'version')::bigint > a.save_version OR payload->>'status' IS NULL OR payload->>'status' NOT IN ('completed','failed','abandoned')
    THEN RETURN jsonb_build_object('error','CONFLICT'); END IF;
   UPDATE public.game_adventures SET status=payload->>'status',ended_at=stamp,checkpoint=NULL,checkpoint_key=NULL,checkpoint_floor=NULL,checkpoint_state=NULL WHERE id=a.id RETURNING * INTO a;
  ELSIF action='leave' THEN
   UPDATE public.game_adventure_members SET left_at=stamp WHERE adventure_id=a.id AND player_id=(payload->>'playerId')::uuid AND left_at IS NULL;
   IF NOT EXISTS(SELECT 1 FROM public.game_adventure_members WHERE adventure_id=a.id AND left_at IS NULL) THEN
    UPDATE public.game_adventures SET status='abandoned',ended_at=stamp,checkpoint=NULL,checkpoint_key=NULL,checkpoint_floor=NULL,checkpoint_state=NULL WHERE id=a.id RETURNING * INTO a;
   ELSIF a.leader_id=(payload->>'playerId')::uuid THEN
    UPDATE public.game_adventures SET leader_id=(SELECT player_id FROM public.game_adventure_members WHERE adventure_id=a.id AND left_at IS NULL ORDER BY joined_at,player_id LIMIT 1)
     WHERE id=a.id RETURNING * INTO a;
   END IF;
  ELSE RAISE EXCEPTION 'Unknown adventure operation'; END IF;
  IF a.status <> 'active' THEN
   DELETE FROM public.game_adventure_members WHERE adventure_id=a.id;
  END IF;
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
