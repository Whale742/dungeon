import sys, os
sys.stdout.reconfigure(encoding='utf-8')
from PIL import Image
import numpy as np
from scipy import ndimage

classes = [
    ('戰士', ['荊棘重盾', '鋼鐵聖劍', '雙手劍']),
    ('法師', ['虛空魔杖', '大魔導護符', '嗜血法袍']),
    ('弓箭手', ['破甲獵弓', '靈巧披風', '改良型重弩']),
    ('刺客', ['染毒刺刃', '暗影皮甲', '赫米斯之靴']),
    ('吟遊詩人', ['精靈木豎琴', '祝福絲綢袍', '妖精木提琴']),
    ('煉金術士', ['賢者燒瓶', '防護生化袍', '精密滴管']),
    ('德魯伊', ['自然共鳴', '荒野守護符', '野獸招喚']),
    ('織夢術士', ['命運的紡錘', '莫比烏斯的織機', '偽史古卷']),
    ('觀星者', ['克卜勒的深空天眼', '赫密斯的星盤懷錶', '流浪占星師的斗篷']),
    ('角鬥士', ['斯巴達破陣短劍', '染血的赤銅戰鎧', '血砂角鬥士束帶']),
    ('武士', ['名刀・朧月', '殘心羽織', '妖刀・村雨']),
    ('智者', ['演算透鏡', '慣性計算尺', '解題範本']),
    ('聖騎士', ['晨曦誓約重錘', '受難代贖者聖鎧', '庇護之光軍旗']),
    ('卜者', ['無瑕紫晶球', '鎏金諭示牌盒', '禁忌厄運聖契']),
    ('陰陽師', ['硃砂引靈筆', '退魔水引狩衣', '八咫靈犀鏡']),
]

out_dir = 'public/assets/equipment/exclusive'
source_dir = 'public/assets/equipment/source-sheets'
os.makedirs(out_dir, exist_ok=True)

success_count = 0

for role, items in classes:
    src_path = os.path.join(source_dir, f'{role}.png')
    if not os.path.exists(src_path):
        raise FileNotFoundError(f'Missing {src_path}')
        
    im = Image.open(src_path)
    arr = np.array(im)
    alpha = arr[:, :, 3]
    w, h = im.size
    
    # Identify components with alpha > 15
    mask = alpha > 15
    labeled, num = ndimage.label(mask)
    
    comps = []
    for i in range(1, num + 1):
        cmask = labeled == i
        cnt = cmask.sum()
        if cnt < 50: continue
        cy, cx = ndimage.center_of_mass(cmask)
        comps.append({'id': i, 'count': cnt, 'cx': cx, 'cy': cy})
        
    # The 3 primary anchors: left (cx < 0.40w), center (0.35w..0.68w), right (cx > 0.60w)
    c0 = max([c for c in comps if c['cx'] < 0.40 * w], key=lambda c: c['count'])
    c1 = max([c for c in comps if 0.35 * w <= c['cx'] <= 0.68 * w], key=lambda c: c['count'])
    c2 = max([c for c in comps if c['cx'] > 0.60 * w], key=lambda c: c['count'])
    
    m0 = labeled == c0['id']
    m1 = labeled == c1['id']
    m2 = labeled == c2['id']
    
    # 2D Euclidean Distance Field Voronoi partitioning
    d0 = ndimage.distance_transform_edt(~m0)
    d1 = ndimage.distance_transform_edt(~m1)
    d2 = ndimage.distance_transform_edt(~m2)
    
    v0 = (d0 <= d1) & (d0 <= d2)
    v1 = (d1 < d0) & (d1 <= d2)
    v2 = (d2 < d0) & (d2 < d1)
    
    regions = [v0, v1, v2]
    print(f'=== 處理 {role} ({w}x{h}) ===')
    
    for k, item_name in enumerate(items):
        item_arr = arr.copy()
        item_arr[~regions[k], 3] = 0
        
        item_img = Image.fromarray(item_arr)
        bbox = item_img.getbbox()
        if bbox is None:
            raise ValueError(f'Empty bbox for {item_name}')
            
        pad = 8
        crop_box = (
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(w, bbox[2] + pad),
            min(h, bbox[3] + pad)
        )
        cropped = item_img.crop(crop_box)
        
        target_path = os.path.join(out_dir, f'{item_name}.webp')
        cropped.save(target_path, 'WEBP', lossless=True)
        print(f'  [{k+1}] {item_name} -> {cropped.size[0]}x{cropped.size[1]}px, 已儲存至 {target_path}')
        success_count += 1
        
        # If item is 流浪占星師的斗篷, also save 流浪占星師的粗呢斗篷.webp as alias if needed
        if item_name == '流浪占星師的斗篷':
            alias_path = os.path.join(out_dir, '流浪占星師的粗呢斗篷.webp')
            cropped.save(alias_path, 'WEBP', lossless=True)

print(f'\n🎉 處理完成！共成功產出 {success_count} 個專屬裝備 webp 檔至 {out_dir}')
