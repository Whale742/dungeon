-- Phase 4. Never restore these rows from an adventure checkpoint.
-- Rollback: disable career endpoints/hooks, back up these tables, then drop
-- game_career_commit(jsonb), game_career_read(uuid), events and stats tables.
CREATE TABLE public.game_career_stats (
 player_id uuid PRIMARY KEY REFERENCES public.game_players(id) ON DELETE CASCADE,
 adventures bigint NOT NULL DEFAULT 0, battles bigint NOT NULL DEFAULT 0,
 wins bigint NOT NULL DEFAULT 0, bosses bigint NOT NULL DEFAULT 0,
 highest_floor integer NOT NULL DEFAULT 0,
 damage bigint NOT NULL DEFAULT 0, healing bigint NOT NULL DEFAULT 0,
 classes jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.game_career_events (
 player_id uuid NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
 event_id text NOT NULL CHECK(char_length(event_id) BETWEEN 1 AND 200),
 adventure_id uuid NOT NULL,
 encounter_id uuid,
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(player_id,event_id)
);
CREATE INDEX game_career_events_adventure_idx ON public.game_career_events(adventure_id,encounter_id);
ALTER TABLE public.game_career_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_career_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_career_stats,public.game_career_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.game_career_stats,public.game_career_events TO service_role;

CREATE FUNCTION public.game_career_commit(events jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e jsonb; old jsonb; pid uuid; kind text; role text; d bigint; h bigint; f integer; b integer; accepted integer:=0;
BEGIN
 IF jsonb_typeof(events) IS DISTINCT FROM 'array' OR jsonb_array_length(events)>100 THEN RAISE EXCEPTION 'Invalid career batch'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(events) ORDER BY value->>'playerId',value->>'key' LOOP
  pid:=(e->>'playerId')::uuid; kind:=e->>'kind'; role:=e->>'role';
  d:=coalesce((e->>'damage')::bigint,0); h:=coalesce((e->>'healing')::bigint,0);
  f:=coalesce((e->>'floor')::integer,0); b:=coalesce((e->>'bosses')::integer,0);
  IF pid IS NULL OR e->>'key' IS NULL OR e->>'adventureId' IS NULL OR kind IS NULL OR
     kind NOT IN ('adventure','encounter','floor','combat','victory') OR least(d,h,f,b)<0 OR
     greatest(d,h)>9007199254740991 OR (kind='encounter' AND (role IS NULL OR role NOT IN
       ('warrior','mage','archer','assassin','bard','alchemist','druid','paladin','gladiator','stargazer','dreamweaver','samurai','sage','augur','onmyoji'))) OR
     (kind IN ('encounter','combat','victory') AND (e->>'encounterId' IS NULL OR e->>'runId' IS NULL))
   THEN RAISE EXCEPTION 'Invalid authoritative career event'; END IF;
  INSERT INTO public.game_career_events(player_id,event_id,adventure_id,encounter_id,payload)
   VALUES(pid,e->>'key',(e->>'adventureId')::uuid,(e->>'encounterId')::uuid,e) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
   SELECT payload INTO old FROM public.game_career_events WHERE player_id=pid AND event_id=e->>'key';
   IF old IS DISTINCT FROM e THEN RAISE EXCEPTION 'Career event conflict'; END IF;
   CONTINUE;
  END IF;
  accepted:=accepted+1;
  INSERT INTO public.game_career_stats(player_id) VALUES(pid) ON CONFLICT DO NOTHING;
  -- The row lock serializes concurrent batches for the same player. Event
  -- insertion and every counter update commit or roll back in one transaction.
  UPDATE public.game_career_stats SET
   adventures=adventures+CASE WHEN kind='adventure' THEN 1 ELSE 0 END,
   battles=battles+CASE WHEN kind='encounter' THEN 1 ELSE 0 END,
   wins=wins+CASE WHEN kind='victory' THEN 1 ELSE 0 END,
   bosses=bosses+CASE WHEN kind='victory' THEN b ELSE 0 END,
   highest_floor=greatest(highest_floor,f), damage=damage+d,healing=healing+h,
   classes=CASE WHEN kind='encounter' THEN jsonb_set(classes,ARRAY[role],to_jsonb(coalesce((classes->>role)::bigint,0)+1)) ELSE classes END,
   updated_at=now() WHERE player_id=pid;
 END LOOP;
 RETURN jsonb_build_object('accepted',accepted);
END;
$$;
CREATE FUNCTION public.game_career_read(player_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('adventures',coalesce(s.adventures,0),'battles',coalesce(s.battles,0),
  'wins',coalesce(s.wins,0),'bosses',coalesce(s.bosses,0),'highestFloor',coalesce(s.highest_floor,0),
  'damage',coalesce(s.damage,0),'healing',coalesce(s.healing,0),'classes',coalesce(s.classes,'{}'::jsonb),
  'mostPlayedRole',(SELECT key FROM jsonb_each_text(coalesce(s.classes,'{}'::jsonb)) ORDER BY value::bigint DESC,key LIMIT 1))
 FROM (SELECT game_career_read.player_id AS id) p LEFT JOIN public.game_career_stats s ON s.player_id=p.id;
$$;
REVOKE ALL ON FUNCTION public.game_career_commit(jsonb),public.game_career_read(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.game_career_commit(jsonb),public.game_career_read(uuid) TO service_role;
