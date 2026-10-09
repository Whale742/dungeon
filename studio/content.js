import { SupabaseRest } from './supabase.js';
import {createHash} from 'node:crypto';
import { catalog, storyKey, narrativeVariant } from './catalog.js';
import { STORY_TEXTS, ROUTE_STORIES, BATTLE_NARRATIVES, getRouteBossStory } from '../game/constants.js';
export function renderTemplate(value, vars={}) { return String(value||'').replace(/\{(player|floor|boss|route|rageMultiplier)\}/g,(all,key)=>Object.hasOwn(vars,key)?String(vars[key]):all); }
export const contentCache={data:null,loadedAt:0,pending:null,hash:null};
export async function refreshPublished(cloud=new SupabaseRest()) {
  if(contentCache.pending)return contentCache.pending;
  contentCache.pending=(async()=>{
    try {const tables=['role_profiles','skill_copies','story_copies','game_assets','asset_bindings'];
      const rows=await Promise.all(tables.map(t=>cloud.rows(t,t==='game_assets'?'is_public=eq.true':'status=eq.published',true)));
      const data=Object.fromEntries(tables.map((t,i)=>[t,rows[i]])),hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
      if(hash!==contentCache.hash){contentCache.data=data;contentCache.hash=hash;contentCache.loadedAt=Date.now();}return true;
    }catch{return false;}finally{contentCache.pending=null;}
  })();return contentCache.pending;
}
export function createRoomContent() {
  const data=structuredClone(contentCache.data||{}), rows=new Map((data.story_copies||[]).map(s=>[s.story_key,s]));
  const storyTexts=Object.fromEntries(Object.entries(STORY_TEXTS).map(([key,s])=>{
    const row=rows.get('story.'+key);return [key,{...s,...(row?{title:typeof s.title==='function'?floor=>renderTemplate(row.title,{floor}):row.title,paragraphs:row.paragraphs}:{} )}];
  }));
  const routeStories=structuredClone(ROUTE_STORIES);
  for(const [route,outcomes] of Object.entries(routeStories))for(const [outcome,s]of Object.entries(outcomes)) {const row=rows.get(storyKey('route',route,outcome));if(row){if(typeof s==='string'){outcomes[outcome]=row.body||s;}else{s.story=row.body;s.title=row.title;}}}
  const monsters=structuredClone(BATTLE_NARRATIVES.monsters);
  for(const [boss,actions]of Object.entries(monsters))for(const action of Object.keys(actions)){const row=rows.get(storyKey('battle','monster',boss,action));if(row)actions[action]=row.body;}
  return {storyTexts,routeStories,battleNarratives:{monsters,getPlayerSkillNarrative(p,id,extra={}){const row=rows.get(storyKey('battle','player',p.role,id,narrativeVariant(p,extra)));return row?renderTemplate(row.body,{player:p.name}):BATTLE_NARRATIVES.getPlayerSkillNarrative(p,id,extra);}},
    text(key,fallback,vars={}){return renderTemplate(rows.get(key)?.body??fallback,vars);},
    getRouteBossStory(route,boss){const clean=String(boss).replace(/^【削弱】/,'');return rows.get(storyKey('boss',route,clean))?.body||getRouteBossStory(route,boss);},
    // Once sent to a joining client; never included in repeated room:update.
    snapshot:data, revision:contentCache.loadedAt};
}
export function publicDefaults(){return catalog;}
