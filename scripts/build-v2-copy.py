from pathlib import Path
import re,json
doc=Path('docs/Dungeon_Abyss_v2.md').read_text(encoding='utf-8')
roles=['warrior','paladin','druid','gladiator','samurai','archer','mage','dreamweaver','bard','alchemist','stargazer','augur','onmyoji','sage','assassin']
maps={
'warrior':['passive','basic','w_strike','w_shield','w_cleave'],
'paladin':['passive','basic','pal_glory','pal_grace'],
'druid':['passive','basic','dru_transform','dru_summon_treant','dru_summon_wolf'],
'gladiator':['passive','basic','g_sacrifice__outside','g_arena__outside','g_sacrifice__arena','g_arena__arena'],
'samurai':['passive','basic','sa_cut','sa_tsubame'],
'archer':['passive','basic','a_shot','a_rain','crossbow_intro','basic__crossbow','a_reload','a_frenzy_reload'],
'mage':['passive','basic','m_blast','m_drain'],
'dreamweaver':['passive','basic','dw_butterfly','dw_false_dream'],
'bard':['passive','basic','b_heal','b_buff','exclusive_intro','b_nocturne','b_frenzy','b_revive'],
'alchemist':['passive','basic','alc_flask','alc_fate'],
'stargazer':['passive','basic','sg_observe','sg_clock'],
'augur':['passive','basic','aug_bind','aug_reckon'],
'onmyoji':['passive','basic','onm_talisman','onm_detonate'],
'sage':['passive','equation_properties','basic','sge_deduce','sge_induce'],
'assassin':['passive','basic','s_stab','s_smoke']}
def clean(s):
 s=re.sub(r'^>.*$','',s,flags=re.M)
 s=s.replace('---','').replace('**','').replace('`','')
 return re.sub(r'\n{3,}','\n\n',s).strip()
data={}
sections=re.split(r'^## \d+｜',doc,flags=re.M)[1:]
for role,section in zip(roles,sections):
 section=section.split('\n## 附錄')[0]
 headings=list(re.finditer(r'^#{3,4} (.+)$',section,re.M))
 assert len(headings)==len(maps[role]),(role,len(headings))
 row={'intro':clean(section[:headings[0].start()].split('\n',1)[1]),'skills':{}}
 for i,(match,key) in enumerate(zip(headings,maps[role])):
  title=match.group(1).split('｜')[-1].strip()
  title=re.sub(r'（`.*?`）|【.*?】','',title).strip()
  body=clean(section[match.end():headings[i+1].start() if i+1<len(headings) else len(section)])
  # Retired clauses are implementation notes, not active player effects.
  body=re.sub(r'完全移除原有.*?減傷。','大成功僅提供治療與淨化。',body)
  body=re.sub(r'本技能僅保留傷害提高 50%：.*?增加 ATK 或 DEF。','本技能僅提供本回合全隊造成傷害 +50%。',body,flags=re.S)
  row['skills'][key]={'display_name':title,'short_copy':body,'full_copy':body}
 if role=='sage':
  p_copy = row['skills']['passive']['full_copy']+'\n\n'+row['skills']['equation_properties']['full_copy']
  p_copy = p_copy.replace('超過 X=60','超過 X=60（X60）').replace('上限 25%','上限 25%（最高 25%）')
  row['skills']['passive']['full_copy']=p_copy
  row['skills']['sge_equation']={'display_name':'方程結算','short_copy':p_copy,'full_copy':p_copy}
  row['skills']['basic']['full_copy']=row['skills']['basic']['full_copy'].replace('固定獲得 10 點 X','固定獲得 10 點 X（固定 10 X）')
  row['skills']['sge_deduce']['full_copy']=row['skills']['sge_deduce']['full_copy'].replace('固定獲得 14 點 X','固定獲得 14 點 X（固定 14 X）')
  row['skills']['sge_induce']['full_copy']=row['skills']['sge_induce']['full_copy'].replace('若目前運算元為奇數則 +8；若為偶數則 +9','若運算元為奇數，運算元+8，反之，運算元+9')
  for key in ['basic','sge_deduce','sge_induce']:
   base_skill = row['skills'][key]
   lines = [ln.strip() for ln in base_skill['full_copy'].splitlines() if ln.strip()]
   intro_lines = [ln for ln in lines if not ln.startswith('- 假設：') and not ln.startswith('- 求解：') and not ln.startswith('本次求解結束後')]
   hyp_lines = [ln.replace('- 假設：','【假設階段】：') for ln in lines if ln.startswith('- 假設：')]
   sol_lines = [ln.replace('- 求解：','【求解階段】：') for ln in lines if ln.startswith('- 求解：') or ln.startswith('本次求解結束後')]
   hyp_text = '\n'.join(intro_lines + hyp_lines)
   sol_text = '\n'.join(intro_lines + sol_lines) + '（其餘機率無事發生或思緒紊亂）'
   row['skills'][key+'__hypothesis']={'display_name':base_skill['display_name'],'short_copy':hyp_text,'full_copy':hyp_text}
   row['skills'][key+'__solve']={'display_name':base_skill['display_name'],'short_copy':sol_text,'full_copy':sol_text}
 if role=='dreamweaver':
  row['skills']['basic']['full_copy']+='\n\n'+row['skills']['passive']['full_copy']
 if role=='samurai':
  row['skills']['sa_tsubame']['display_name']='秘劍 • 燕返'
 if role=='druid':
  row['skills']['basic__treant']=row['skills']['basic'].copy()
  row['skills']['basic__werewolf']={'display_name':'狼人強化普攻','short_copy':'單體物理：round(10 + 250% × A物)，變身當下立即攻擊一次。','full_copy':'狼人強化普攻：單體物理 round(10 + 250% × A物)。變身當下立即攻擊一次；形態期間普攻使用相同公式。'}
  row['skills']['dru_claw']=row['skills']['basic__werewolf'].copy()
  row['skills']['basic__tree']={'display_name':'樹木休眠','short_copy':'休眠 1 回合，無法行動。','full_copy':'遭受致命傷害後休眠 1 回合，無法行動。'}
 if role=='gladiator':
  for field in ['short_copy','full_copy']:
   row['skills']['g_arena__outside'][field]=re.sub(r'進入場內後.*?。','',row['skills']['g_arena__outside'][field]).strip()
  for k in ['g_sacrifice','g_arena']:row['skills'][k]=row['skills'][k+'__outside'].copy()
 if role=='bard':
  row['skills']['b_nocturne']['full_copy']+='\n既有精靈木提琴：取代一技能，30% 機率沉睡（另受效果抗性影響）。'
  row['skills']['b_frenzy']['full_copy']+='\n既有精靈木提琴：取代二技能，本回合全隊增傷 70%；次回合扣除全隊各自最大生命 20%。'
  row['skills']['b_revive']={'display_name':'甦生之歌','short_copy':'指定可復活的死亡隊友，以最大生命 35% 復活；施放者及復活者下一回合無法行動。','full_copy':'既有吟遊詩人條件行動，不需專屬裝備。指定可復活的死亡隊友，以 max(1, floor(35% × 目標最大生命)) 復活，兩人下一回合無法行動。角鬥士同歸於盡當層不可復活。'}
  row['skills']['b_heal']['full_copy']+='\n精靈木豎琴的既有治療增幅另行套用；不追加通關固定治療成長。'
 if role=='archer':
  row['skills']['basic__crossbow']['full_copy']+='\n既有爆裂箭為真傷，僅使用 ATK_base，不加物攻／魔攻；依各箭實際傷害等量自傷。穿甲箭保留既有物理抗性結算。'
 for k in ['exclusive_intro','crossbow_intro','equation_properties']:row['skills'].pop(k,None)
 data[role]=row
Path('game/v2-copy.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
