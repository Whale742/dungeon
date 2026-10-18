import os
import shutil
import numpy as np
from PIL import Image
import scipy.ndimage as ndi
from collections import deque

OUTPUT_DIR = r"d:\My Files\web\dungeon\public\assets\Equipments"

def remove_bg_clean(crop_img, is_ring=False):
    """
    Removes the white/off-white background cleanly with de-fringing.
    If is_ring=True, also removes the inner cavity of the ring.
    For non-rings, only outer perimeter flood fill is used to avoid eating specular highlights.
    """
    arr = np.array(crop_img.convert("RGBA"), dtype=np.float32)
    rgb = arr[:, :, :3]
    
    max_c = np.max(rgb, axis=2)
    min_c = np.min(rgb, axis=2)
    sat = max_c - min_c
    
    # Pure background is very bright and low saturation
    is_pure_bg = (min_c > 240) & (sat < 15)
    
    H, W = is_pure_bg.shape
    visited = np.zeros((H, W), dtype=bool)
    bg_mask = np.zeros((H, W), dtype=bool)
    
    queue = deque()
    # Boundary flood fill
    for y in range(H):
        for x in (0, W - 1):
            if is_pure_bg[y, x] and not visited[y, x]:
                visited[y, x] = True
                queue.append((y, x))
    for x in range(W):
        for y in (0, H - 1):
            if is_pure_bg[y, x] and not visited[y, x]:
                visited[y, x] = True
                queue.append((y, x))
                
    while queue:
        cy, cx = queue.popleft()
        bg_mask[cy, cx] = True
        for ny, nx in ((cy+1, cx), (cy-1, cx), (cy, cx+1), (cy, cx-1)):
            if 0 <= ny < H and 0 <= nx < W and not visited[ny, nx]:
                if is_pure_bg[ny, nx]:
                    visited[ny, nx] = True
                    queue.append((ny, nx))
                    
    # Only if is_ring, also remove the central ring hole
    if is_ring:
        lbl, num = ndi.label(is_pure_bg)
        for i in range(1, num + 1):
            comp = (lbl == i)
            if not np.any(comp & bg_mask):
                comp_area = np.sum(comp)
                # Check if it's large and pure white (ring cavity)
                if comp_area > 300 and np.mean(min_c[comp]) > 245 and np.mean(sat[comp]) < 8:
                    bg_mask[comp] = True

    # Transition zone anti-aliasing / de-fringing
    alpha = np.ones((H, W), dtype=np.float32)
    alpha[bg_mask] = 0.0
    
    dilated_bg = ndi.binary_dilation(bg_mask, iterations=2)
    transition = dilated_bg & (~bg_mask)
    
    for y, x in zip(*np.where(transition)):
        val = min_c[y, x]
        if val > 210:
            a = max(0.0, min(1.0, (252.0 - val) / (252.0 - 210.0)))
            alpha[y, x] = a
            
    out_rgb = rgb.copy()
    for y, x in zip(*np.where((alpha > 0.01) & (alpha < 0.99))):
        a = alpha[y, x]
        c = (rgb[y, x] - (1.0 - a) * 253.0) / a
        out_rgb[y, x] = np.clip(c, 0, 255)
        
    out = np.dstack([out_rgb, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out)


def process_t1():
    print("=== Processing T1 Equipments ===")
    t1_path = os.path.join(OUTPUT_DIR, "T1全圖.png")
    t1 = Image.open(t1_path)
    arr = np.array(t1)

    t1_items = [
        # Row 1 (7 items)
        {"name": "精煉短劍", "box": (5, 380, 100, 260), "rot": -45, "is_ring": False},
        {"name": "獵人長弓", "box": (5, 385, 290, 470), "rot": -45, "is_ring": False},
        {"name": "裂甲戰斧", "box": (5, 385, 480, 690), "rot": -45, "is_ring": False},
        {"name": "魔力水晶", "box": (60, 375, 720, 920), "rot": 0, "is_ring": False},
        {"name": "星紋法杖", "box": (5, 385, 960, 1110), "rot": -45, "is_ring": False},
        {"name": "禁忌魔典", "box": (60, 390, 1120, 1390), "rot": 0, "is_ring": False},
        {"name": "奧術短刃", "box": (35, 390, 1420, 1620), "rot": -27, "is_ring": False},
        
        # Row 2 (6 items)
        {"name": "破舊麻衣", "box": (400, 685, 30, 290), "rot": 0, "is_ring": False},
        {"name": "探險者皮甲", "box": (390, 690, 280, 545), "rot": 0, "is_ring": False},
        {"name": "旅人長袍", "box": (380, 690, 540, 800), "rot": 0, "is_ring": False},
        {"name": "輕型護胸", "box": (390, 690, 790, 1050), "rot": 0, "is_ring": False},
        {"name": "精鋼胸甲", "box": (390, 695, 1055, 1335), "rot": 0, "is_ring": False, "alias": "精銅胸甲"},
        {"name": "鋼鐵護甲", "box": (390, 690, 1340, 1655), "rot": 0, "is_ring": False},
        
        # Row 3 (8 items)
        {"name": "熾熱紅寶石指環", "box": (690, 915, 20, 215), "rot": 0, "is_ring": True, "alias": "熾熱紅寶石"},
        {"name": "青銅指環", "box": (720, 885, 230, 425), "rot": 0, "is_ring": True},
        {"name": "再生草環", "box": (715, 915, 435, 640), "rot": 0, "is_ring": True},
        {"name": "守衛吊墜", "box": (685, 925, 650, 835), "rot": 0, "is_ring": False},
        {"name": "鷹眼羽飾", "box": (685, 925, 850, 1035), "rot": 0, "is_ring": False},
        {"name": "星輝耳墜", "box": (685, 915, 1075, 1225), "rot": 0, "is_ring": False},
        {"name": "均衡護符", "box": (685, 925, 1235, 1445), "rot": 0, "is_ring": False},
        {"name": "霜紋戒指", "box": (695, 920, 1450, 1650), "rot": 0, "is_ring": True},
    ]

    for item in t1_items:
        y0, y1, x0, x1 = item["box"]
        sub = arr[y0:y1, x0:x1]
        
        is_fg = np.mean(sub, axis=2) < 242
        lbl, num = ndi.label(is_fg, structure=np.ones((3, 3)))
        
        areas = [np.sum(lbl == i + 1) for i in range(num)]
        main_lbl = np.argmax(areas) + 1
        main_mask = (lbl == main_lbl)
        
        dilated_main = ndi.binary_dilation(main_mask, iterations=25)
        
        item_mask = np.zeros_like(main_mask)
        objs = ndi.find_objects(lbl)
        for idx, o in enumerate(objs):
            c_lbl = idx + 1
            comp_mask = (lbl == c_lbl)
            if c_lbl == main_lbl:
                item_mask |= comp_mask
                continue
            if np.any(comp_mask & dilated_main):
                item_mask |= comp_mask
                
        if not item["is_ring"]:
            item_mask = ndi.binary_fill_holes(item_mask)
            
        y_idxs, x_idxs = np.where(item_mask)
        pad = 8
        sub_y0 = max(0, np.min(y_idxs) - pad)
        sub_y1 = min(sub.shape[0], np.max(y_idxs) + pad + 1)
        sub_x0 = max(0, np.min(x_idxs) - pad)
        sub_x1 = min(sub.shape[1], np.max(x_idxs) + pad + 1)
        
        crop = Image.fromarray(sub[sub_y0:sub_y1, sub_x0:sub_x1])
        crop_rgba = remove_bg_clean(crop, is_ring=item["is_ring"])
        
        crop_item_mask = item_mask[sub_y0:sub_y1, sub_x0:sub_x1]
        dilated_item = ndi.binary_dilation(crop_item_mask, iterations=4)
        arr_rgba = np.array(crop_rgba)
        arr_rgba[~dilated_item, 3] = 0
        
        final_img = Image.fromarray(arr_rgba)
        if item["rot"] != 0:
            final_img = final_img.rotate(item["rot"], expand=True, resample=Image.Resampling.BICUBIC)
            
        bbox = final_img.getbbox()
        if bbox:
            final_img = final_img.crop(bbox)
            
        save_path = os.path.join(OUTPUT_DIR, f"{item['name']}.webp")
        final_img.save(save_path, format="WEBP", lossless=True)
        print(f"Saved: {save_path} (size={final_img.size})")
        
        if "alias" in item:
            alias_path = os.path.join(OUTPUT_DIR, f"{item['alias']}.webp")
            shutil.copyfile(save_path, alias_path)
            print(f"Saved alias: {alias_path}")


def process_t2():
    print("=== Processing T2 Equipments ===")
    # T2-1 items
    t2_1_path = os.path.join(OUTPUT_DIR, "T2 合成途徑-1.png")
    img1 = Image.open(t2_1_path)
    arr1 = np.array(img1)
    W1 = img1.width

    t2_1_config = [
        {"name": "符文長劍", "y_start": 0, "y_end": 210, "is_ring": False},
        {"name": "破陣鋒刃", "y_start": 250, "y_end": 452, "is_ring": False},
        {"name": "精鋼鎧", "y_start": 490, "y_end": 705, "is_ring": False},
        {"name": "生命指環", "y_start": 750, "y_end": 925, "is_ring": True},
        {"name": "守護者吊墜", "y_start": 970, "y_end": 1157, "is_ring": False},
        {"name": "聖歌權杖", "y_start": 1185, "y_end": 1360, "is_ring": False},
    ]

    for item in t2_1_config:
        sub = arr1[item["y_start"]:item["y_end"], int(W1 * 0.6):]
        is_fg = np.mean(sub, axis=2) < 242
        lbl, num = ndi.label(is_fg, structure=np.ones((3, 3)))
        
        areas = [np.sum(lbl == i + 1) for i in range(num)]
        main_lbl = np.argmax(areas) + 1
        item_mask = (lbl == main_lbl)
        
        dilated_main = ndi.binary_dilation(item_mask, iterations=10)
        for idx, o in enumerate(ndi.find_objects(lbl)):
            c_lbl = idx + 1
            if c_lbl != main_lbl and o[1].start >= 70 and np.any((lbl == c_lbl) & dilated_main):
                item_mask |= (lbl == c_lbl)
                
        if not item["is_ring"]:
            item_mask = ndi.binary_fill_holes(item_mask)
            
        y_idxs, x_idxs = np.where(item_mask)
        pad = 6
        y0 = max(0, np.min(y_idxs) - pad)
        y1 = min(sub.shape[0], np.max(y_idxs) + pad + 1)
        x0 = max(0, np.min(x_idxs) - pad)
        x1 = min(sub.shape[1], np.max(x_idxs) + pad + 1)
        
        crop = Image.fromarray(sub[y0:y1, x0:x1])
        crop_rgba = remove_bg_clean(crop, is_ring=item["is_ring"])
        
        crop_item_mask = item_mask[y0:y1, x0:x1]
        dilated_item = ndi.binary_dilation(crop_item_mask, iterations=3)
        arr_rgba = np.array(crop_rgba)
        arr_rgba[~dilated_item, 3] = 0
        
        final_img = Image.fromarray(arr_rgba).crop(Image.fromarray(arr_rgba).getbbox())
        save_path = os.path.join(OUTPUT_DIR, f"{item['name']}.webp")
        final_img.save(save_path, format="WEBP", lossless=True)
        print(f"Saved: {save_path} (size={final_img.size})")

    # T2-2 items
    t2_2_path = os.path.join(OUTPUT_DIR, "T2 合成途徑-2.png")
    img2 = Image.open(t2_2_path)
    arr2 = np.array(img2)
    W2 = img2.width

    t2_2_config = [
        {"name": "追獵長弓", "y_start": 0, "y_end": 221, "is_ring": False},
        {"name": "破城巨斧", "y_start": 250, "y_end": 476, "is_ring": False},
        {"name": "霜蝕秘典", "y_start": 505, "y_end": 722, "is_ring": False},
        {"name": "雙相短刃", "y_start": 750, "y_end": 940, "is_ring": False},
        {"name": "古紋長袍", "y_start": 975, "y_end": 1188, "is_ring": False},
        {"name": "守城戰衣", "y_start": 1220, "y_end": 1410, "is_ring": False},
    ]

    for item in t2_2_config:
        sub = arr2[item["y_start"]:item["y_end"], int(W2 * 0.6):]
        is_fg = np.mean(sub, axis=2) < 242
        lbl, num = ndi.label(is_fg, structure=np.ones((3, 3)))
        
        areas = [np.sum(lbl == i + 1) for i in range(num)]
        main_lbl = np.argmax(areas) + 1
        item_mask = (lbl == main_lbl)
        
        dilated_main = ndi.binary_dilation(item_mask, iterations=10)
        for idx, o in enumerate(ndi.find_objects(lbl)):
            c_lbl = idx + 1
            if c_lbl != main_lbl and o[1].start >= 70 and np.any((lbl == c_lbl) & dilated_main):
                item_mask |= (lbl == c_lbl)
                
        if not item["is_ring"]:
            item_mask = ndi.binary_fill_holes(item_mask)
            
        y_idxs, x_idxs = np.where(item_mask)
        pad = 6
        y0 = max(0, np.min(y_idxs) - pad)
        y1 = min(sub.shape[0], np.max(y_idxs) + pad + 1)
        x0 = max(0, np.min(x_idxs) - pad)
        x1 = min(sub.shape[1], np.max(x_idxs) + pad + 1)
        
        crop = Image.fromarray(sub[y0:y1, x0:x1])
        crop_rgba = remove_bg_clean(crop, is_ring=item["is_ring"])
        
        crop_item_mask = item_mask[y0:y1, x0:x1]
        dilated_item = ndi.binary_dilation(crop_item_mask, iterations=3)
        arr_rgba = np.array(crop_rgba)
        arr_rgba[~dilated_item, 3] = 0
        
        final_img = Image.fromarray(arr_rgba).crop(Image.fromarray(arr_rgba).getbbox())
        save_path = os.path.join(OUTPUT_DIR, f"{item['name']}.webp")
        final_img.save(save_path, format="WEBP", lossless=True)
        print(f"Saved: {save_path} (size={final_img.size})")

if __name__ == "__main__":
    process_t1()
    process_t2()
    print("ALL EQUIPMENT WEBP FILES GENERATED SUCCESSFULLY!")
