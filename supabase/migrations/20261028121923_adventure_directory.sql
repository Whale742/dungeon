-- Phase 3. Metadata-only directory and leadership; progress stays in the single
-- route checkpoint. Rollback: disable these endpoints, then drop both functions.
CREATE FUNCTION public.game_adventure_directory(player_id uuid,page_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH candidates AS (
  SELECT a.id,a.leader_id,p.display_name,a.checkpoint_floor,a.checkpoint_state,a.saved_at,a.save_version,a.status,
   (SELECT count(*) FROM public.game_adventure_members m WHERE m.adventure_id=a.id AND m.left_at IS NULL) AS member_count
  FROM public.game_adventure_members mine
  JOIN public.game_adventures a ON a.id=mine.adventure_id
  JOIN public.game_players p ON p.id=a.leader_id
  WHERE mine.player_id=game_adventure_directory.player_id AND mine.left_at IS NULL
   AND a.status='active' AND a.save_version>0
  ORDER BY a.saved_at DESC,a.id LIMIT 26 OFFSET greatest(0,least(coalesce(page_offset,0),10000))
 ), numbered AS (SELECT *,row_number() OVER(ORDER BY saved_at DESC,id) AS n FROM candidates)
 SELECT jsonb_build_object('adventures',coalesce(jsonb_agg(jsonb_build_object(
   'id',id,'leaderId',leader_id,'leaderName',display_name,'memberCount',member_count,
   'checkpointFloor',checkpoint_floor,'checkpointState',checkpoint_state,'savedAt',saved_at,
   'saveVersion',save_version,'status',status) ORDER BY n) FILTER(WHERE n<=25),'[]'::jsonb),
   'hasMore',count(*)>25) FROM numbered;
$$;
REVOKE ALL ON FUNCTION public.game_adventure_directory(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.game_adventure_directory(uuid,integer) TO service_role;

CREATE FUNCTION public.game_adventure_transfer(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.game_adventures; member_id uuid; stamp timestamptz := clock_timestamp();
BEGIN
 IF (payload->>'version')::bigint=0 THEN
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
 IF a.status<>'active' THEN RETURN jsonb_build_object('error','ENDED'); END IF;
 IF a.lease_owner IS DISTINCT FROM (payload->>'owner')::uuid OR
    a.lease_generation IS DISTINCT FROM (payload->>'generation')::bigint OR a.lease_until<=stamp OR
    a.leader_id IS DISTINCT FROM (payload->>'playerId')::uuid OR
    NOT EXISTS(SELECT 1 FROM public.game_adventure_members WHERE adventure_id=a.id AND player_id=(payload->>'targetId')::uuid AND left_at IS NULL)
  THEN RETURN jsonb_build_object('error','CONFLICT'); END IF;
 UPDATE public.game_adventures SET leader_id=(payload->>'targetId')::uuid WHERE id=a.id RETURNING * INTO a;
 RETURN to_jsonb(a)-'checkpoint';
END;
$$;
REVOKE ALL ON FUNCTION public.game_adventure_transfer(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.game_adventure_transfer(jsonb) TO service_role;
