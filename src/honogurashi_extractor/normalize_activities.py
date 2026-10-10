from .localization import build_name, localized_block, preferred_text
from .models import Activity, ItemQuantity
from .normalize import _u32, _name
from .probe import _string_groups


def normalize_activities(tables, snapshot, overrides, archive=None):
    """Decode item relations from fixed, cross-checked database fields."""
    items = {item.numeric_id: item.id for item in snapshot.items.values()}
    treasure = tables.get('treasurebox')
    if treasure:
        candidates = tuple(dict.fromkeys(items[_u32(r,8)] for r in treasure.records if _u32(r,8) in items))
        name = build_name(ja='玉手箱の報酬候補',zh_hant='玉手箱獎勵候選',internal='TREASUREBOX_REWARD_POOL',overrides={})
        snapshot.activities[name.internal] = Activity(name.internal,0,name,'随机奖励候选',
            reward_candidates=candidates,location='夜间玉手箱',
            conditions=('奖励候选池；并非每次全部获得，数量与抽选条件尚未核对',),
            source='treasurebox.dat:8 物品 ID；GameDropTreasureBox 由击倒后的拾取动作调用')
    def rows(name):
        table = tables.get(name)
        return zip(table.records, _string_groups(table), strict=True) if table else []
    def quantities(record, offsets, quantity_offset):
        return tuple(ItemQuantity(items[_u32(record, offset)], _u32(record, offset + quantity_offset))
                     for offset in offsets if _u32(record, offset) in items and _u32(record, offset + quantity_offset))
    for record, group in rows("construction"):
        name = _name(group, overrides, tables["construction"].language_count)
        shift = (tables["construction"].language_count - 6) * 8
        operation = {0: "新建", 1: "改建", 3: "搬迁"}.get(_u32(record, 64 + shift), "建筑工程")
        snapshot.activities[name.internal] = Activity(name.internal, _u32(record, 0), name, "建筑",
            inputs=quantities(record, (220 + 4 * shift, 228 + 4 * shift, 236 + 4 * shift), 4), location="树木建设", money_cost=_u32(record, 216 + 4 * shift),
            conditions=(operation,), source=f"construction.dat:{216 + 4 * shift},{220 + 4 * shift}–{240 + 4 * shift}")
    bundle_places = {}
    for record, group in rows("bundlegroup"):
        label = preferred_text(localized_block(group, 2, tables["bundlegroup"].language_count))
        if "VILLAGE_HEAD" in group[0]: label = "村长家交付委托目录 · " + label
        shift = (tables["bundlegroup"].language_count - 6) * 8
        for offset in (76 + shift, 80 + shift, 84 + shift, 88 + shift):
            if _u32(record, offset): bundle_places[_u32(record, offset)] = label
    for record, group in rows("bundle"):
        name = _name(group, overrides, tables["bundle"].language_count)
        shift = (tables["bundle"].language_count - 6) * 8
        numeric = _u32(record, 0)
        snapshot.activities[name.internal] = Activity(name.internal, numeric, name, "供奉 / 交付目录",
            inputs=quantities(record, (64 + shift, 76 + shift, 88 + shift), 8), rewards=quantities(record, (100 + shift, 112 + shift), 8),
            location=bundle_places.get(numeric, ""), source=f"bundle.dat:{64 + shift}–{124 + shift}; bundlegroup.dat:{76 + shift}–{88 + shift}")
    for record, group in rows("subquestitem"):
        item = items.get(_u32(record, 20))
        if not item: continue
        item_name = snapshot.items[item].name
        translations = {locale: {"ja": "納品候補：", "zh-TW": "交付候選：", "zh-CN": "交付候选：", "ko": "납품 후보: "}.get(locale, "") + text if text else ""
                        for locale, text in item_name.translations.items()}
        name = build_name(ja="納品候補：" + item_name.ja, zh_hant="交付候選：" + (item_name.zh_hant or item_name.zh_hans), internal=group[0], overrides=overrides, translations=translations)
        snapshot.activities[name.internal] = Activity(name.internal, _u32(record, 0), name, "居民交付候选",
            inputs=(ItemQuantity(item, _u32(record, 28)),), conditions=("交付物候选；委托人和截止日以当次委托为准",),
            source="subquestitem.dat:20,28")
    skills = { _u32(r, 0): g[0] for r,g in rows("skilltree") }
    for record, group in rows("skilltree"):
        name = _name(group, overrides, tables["skilltree"].language_count, start=2)
        description = localized_block(group, 2 + tables["skilltree"].language_count, tables["skilltree"].language_count)
        snapshot.activities[name.internal] = Activity(name.internal, _u32(record,0), name, "祠堂能力 / 配方解锁",
            location="岔路祠堂", unlock_flag=_u32(record,80),
            conditions=("消耗物品对应关系待核对",),
            prerequisites=tuple(skills[_u32(record,o)] for o in (48,56,64) if _u32(record,o) in skills),
            description=preferred_text(description), description_translations=description,
            source="skilltree.dat:48–80；92–112 的消耗列尚未确认对应物品")
    for record, group in rows("lostbook"):
        item_id = items.get(_u32(record,len(record)-52))
        if not item_id: continue
        internal = "RETURN_" + group[0]
        translations = {locale: {"ja": "図書返却：", "zh-TW": "圖書歸還：", "zh-CN": "图书归还：", "ko": "도서 반환: "}.get(locale, "") + text if text else ""
                        for locale, text in localized_block(group, 1, tables["lostbook"].language_count).items()}
        name = build_name(ja="図書返却："+group[1], zh_hant="圖書歸還："+group[5], internal=internal, overrides=overrides, translations=translations)
        snapshot.activities[internal] = Activity(internal,_u32(record,0),name,"图书归还",inputs=(ItemQuantity(item_id,1),),location="图书馆",source="lostbook.dat:记录末尾前52字节")
    # Wiki leads and string references in scripts are not executable-condition
    # evidence. Restaurant counts and night pickup pools
    # remain absent until their game-side control flow is decoded.
