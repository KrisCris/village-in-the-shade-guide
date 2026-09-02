from __future__ import annotations

from collections.abc import Mapping

from .models import LocalizedName


_TRADITIONAL_TO_SIMPLIFIED = str.maketrans(
    {
        "蔥": "葱",
        "種": "种",
        "醃": "腌",
        "漬": "渍",
        "機": "机",
        "體": "体",
        "魚": "鱼",
        "雞": "鸡",
        "豬": "猪",
        "貓": "猫",
        "馬": "马",
        "與": "与",
        "於": "于",
        "時": "时",
        "間": "间",
        "長": "长",
        "葉": "叶",
        "樹": "树",
        "蘿": "萝",
        "蔔": "卜",
        "薑": "姜",
        "麥": "麦",
        "穀": "谷",
        "產": "产",
        "製": "制",
        "價": "价",
        "錢": "钱",
        "買": "买",
        "賣": "卖",
        "獲": "获",
        "條": "条",
        "件": "件",
        "數": "数",
        "開": "开",
        "關": "关",
        "連": "连",
        "續": "续",
        "適": "适",
        "種": "种",
        "植": "植",
        "農": "农",
        "場": "场",
        "園": "园",
        "術": "术",
        "藥": "药",
        "氣": "气",
        "風": "风",
        "雲": "云",
        "寶": "宝",
        "礦": "矿",
        "鐵": "铁",
        "銅": "铜",
        "銀": "银",
        "鋼": "钢",
        "燈": "灯",
        "籠": "笼",
        "門": "门",
        "車": "车",
        "繩": "绳",
        "網": "网",
        "布": "布",
        "絲": "丝",
        "紅": "红",
        "綠": "绿",
        "藍": "蓝",
        "黃": "黄",
        "湯": "汤",
        "飯": "饭",
        "麵": "面",
        "餅": "饼",
        "醬": "酱",
        "鹽": "盐",
        "糖": "糖",
        "鮮": "鲜",
        "奶": "奶",
        "劑": "剂",
        "裝": "装",
        "備": "备",
        "為": "为",
        "來": "来",
        "這": "这",
        "個": "个",
        "從": "从",
        "還": "还",
        "會": "会",
        "後": "后",
        "裡": "里",
        "點": "点",
        "讓": "让",
        "對": "对",
        "應": "应",
        "處": "处",
        "發": "发",
        "現": "现",
        "實": "实",
        "驗": "验",
        "圖": "图",
        "標": "标",
        "記": "记",
        "錄": "录",
        "級": "级",
        "達": "达",
        "進": "进",
        "擇": "择",
        "則": "则",
        "無": "无",
        "萬": "万",
        "兩": "两",
        "隻": "只",
    }
)


def build_name(
    *, ja: str, zh_hant: str, internal: str, overrides: Mapping[str, str]
) -> LocalizedName:
    override = overrides.get(internal)
    if override:
        zh_hans = override
        review_status = "override"
    elif zh_hant:
        zh_hans = zh_hant.translate(_TRADITIONAL_TO_SIMPLIFIED)
        review_status = "auto"
    else:
        zh_hans = ja or internal
        review_status = "source-ja"
    aliases = tuple(dict.fromkeys(value for value in (zh_hans, zh_hant, ja, internal) if value))
    return LocalizedName(
        zh_hans=zh_hans,
        zh_hant=zh_hant,
        ja=ja,
        internal=internal,
        aliases=aliases,
        review_status=review_status,
    )
