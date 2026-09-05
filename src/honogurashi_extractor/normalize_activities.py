from .localization import build_name
from .models import Activity, ItemQuantity
from .normalize import _u32, _name
from .probe import _string_groups


def normalize_activities(tables, snapshot, overrides, archive=None):
    """Decode item relations from fixed, cross-checked database fields."""
    items = {item.numeric_id: item.id for item in snapshot.items.values()}
    def rows(name):
        table = tables.get(name)
        return zip(table.records, _string_groups(table), strict=True) if table else []
    def quantities(record, offsets, quantity_offset):
        return tuple(ItemQuantity(items[_u32(record, offset)], _u32(record, offset + quantity_offset))
                     for offset in offsets if _u32(record, offset) in items and _u32(record, offset + quantity_offset))
    for record, group in rows("construction"):
        name = _name(group, overrides)
        operation = {0: "新建", 1: "改建", 3: "搬迁"}.get(_u32(record, 64), "建筑工程")
        snapshot.activities[name.internal] = Activity(name.internal, _u32(record, 0), name, "建筑",
            inputs=quantities(record, (220, 228, 236), 4), location="树木建设", money_cost=_u32(record, 216),
            conditions=(operation,), source="construction.dat:216,220–240")
    bundle_places = {}
    for record, group in rows("bundlegroup"):
        label = group[6] or group[2]
        if "VILLAGE_HEAD" in group[0]: label = "村长家交付委托目录 · " + label
        for offset in (76, 80, 84, 88):
            if _u32(record, offset): bundle_places[_u32(record, offset)] = label
    for record, group in rows("bundle"):
        name = _name(group, overrides)
        numeric = _u32(record, 0)
        snapshot.activities[name.internal] = Activity(name.internal, numeric, name, "供奉 / 交付目录",
            inputs=quantities(record, (64, 76, 88), 8), rewards=quantities(record, (100, 112), 8),
            location=bundle_places.get(numeric, ""), source="bundle.dat:64–124; bundlegroup.dat:76–88")
    for record, group in rows("subquestitem"):
        item = items.get(_u32(record, 20))
        if not item: continue
        item_name = snapshot.items[item].name
        name = build_name(ja="納品候補：" + item_name.ja, zh_hant="交付候選：" + (item_name.zh_hant or item_name.zh_hans), internal=group[0], overrides=overrides)
        snapshot.activities[name.internal] = Activity(name.internal, _u32(record, 0), name, "居民交付候选",
            inputs=(ItemQuantity(item, _u32(record, 28)),), conditions=("交付物候选；委托人和截止日以当次委托为准",),
            source="subquestitem.dat:20,28")
    skills = { _u32(r, 0): g[0] for r,g in rows("skilltree") }
    for record, group in rows("skilltree"):
        name = build_name(ja=group[2], zh_hant=group[6], internal=group[0], overrides=overrides)
        snapshot.activities[name.internal] = Activity(name.internal, _u32(record,0), name, "祠堂能力 / 配方解锁",
            location="岔路祠堂", unlock_flag=_u32(record,80),
            conditions=("消耗物品对应关系待核对",),
            prerequisites=tuple(skills[_u32(record,o)] for o in (48,56,64) if _u32(record,o) in skills),
            description=group[12] if len(group)>12 and group[12] else group[8] if len(group)>8 else "",
            source="skilltree.dat:48–80；92–112 的消耗列尚未确认对应物品")
    for record, group in rows("lostbook"):
        item_id = items.get(_u32(record,len(record)-52))
        if not item_id: continue
        internal = "RETURN_" + group[0]
        name = build_name(ja="図書返却："+group[1], zh_hant="圖書歸還："+group[5], internal=internal, overrides=overrides)
        snapshot.activities[internal] = Activity(internal,_u32(record,0),name,"图书归还",inputs=(ItemQuantity(item_id,1),),location="图书馆",source="lostbook.dat:记录末尾前52字节")
    # Wiki leads and string references in scripts are not executable-condition
    # evidence. Restaurant counts, friendship thresholds and night pickup pools
    # remain absent until their game-side control flow is decoded.
