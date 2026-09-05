import sourceCatalog from '../../data/sources/appmedia-honogurashi.json';
import sourceOutlines from '../../data/sources/appmedia-outlines.json';
import guideTranslations from '../../data/sources/guide-translations.json';

export type GuideSource = (typeof sourceCatalog.sources)[number] & { chineseTitle: string; headings: string[]; dataTarget?: string; guideTarget?: string };

export function guideTarget(title: string) {
  if (/狩猟のやり方/.test(title)) return '/guides/hunting-plan/';
  if (/農作のやり方/.test(title)) return '/guides/cultivation-plan/';
  if (/玉手箱の場所/.test(title)) return '/guides/collection-map/#treasures';
  if (/勾玉集め|深夜探索/.test(title)) return '/guides/night-preparation/';
  if (/料理の作り方|おすすめ料理/.test(title)) return '/guides/cooking-plan/';
  if (/釣りのやり方/.test(title)) return '/guides/fishing-plan/';
  if (/おすすめスキル/.test(title)) return '/guides/skills/';
  if (/好感度の上げ方|キャラ一覧/.test(title)) return '/guides/residents/';
  if (/紛失図書|狐の社/.test(title)) return '/guides/collection-map/';
  if (/毎日やるべきこと/.test(title)) return '/guides/season-plan/';
  if (/序盤の進め方|攻略チャート一覧|依頼のやり方/.test(title)) return '/guides/progression/';
  if (/キャラクリ変更/.test(title)) return '/guides/appearance/';
  if (/おすすめの金策/.test(title)) return '/planner/';
  return undefined;
}

const exactTitles: Record<string, string> = {
  'ほの暮しの庭攻略': '《静谧田园》攻略总览', '好感度の上げ方': '好感度提升方法', '機種ごとの違い': '各平台版本区别',
  'あんしん暮しモード': '安心生活模式', 'エディションの違い': '各版本内容区别', '狩猟のやり方': '狩猎方法', '採掘のやり方': '采矿方法',
  '取り返せないこと': '不可逆选择与易错过内容', '注視の使い方': '注视功能使用方法', 'スタミナ回復': '体力恢复方法', '農作のやり方': '耕作方法',
  '釣りのやり方': '钓鱼方法', 'マルチはある？': '是否支持多人游戏', '牧畜のやり方': '畜牧方法', '序盤の進め方': '前期推进指南',
  '攻略チャート一覧【ほの暮しの庭】': '主线流程总览', '土地拡張のやり方': '土地扩建方法', 'おすすめの金策【ほの暮しの庭】': '高效赚钱方法',
  '毎日やるべきこと': '每日必做清单', 'キャラ一覧': '角色一览', '雑談・質問掲示板': '常见问题与交流范围', '品質の上げ方': '品质提升方法',
  '怪異(お化け)一覧と対処方法まとめ 怪異の出現条件や倒し方(対処法)を一覧で紹介！': '怪异一览、出现条件与应对方法',
  '指笛の種類': '口哨种类与用途', '依頼のやり方': '委托系统指南', '種・苗一覧': '种子与幼苗一览', '素材一覧': '材料一览', '採取物一覧': '采集物一览',
  '作物一覧': '作物一览', '紛失図書の場所【ほの暮しの庭】': '遗失图书位置', '魚一覧': '鱼类一览', 'スプリンクラー': '洒水器获取与使用',
  '花一覧': '花卉一览', '畜産品一覧': '畜产品一览', '勾玉集め': '勾玉收集方法', '狐の油揚げ': '狐狸油豆腐的获取与用途', '加工品一覧': '加工品一览',
  '狐の社の場所【ほの暮しの庭】': '狐狸神社位置', '調味料一覧': '调味料一览', '料理一覧': '料理一览', 'おすすめ料理': '推荐料理', '獲物一覧': '猎物一览',
  '鉱石一覧': '矿石一览', '購入品一覧': '商店购买品一览', '機械一覧': '机械一览', '泥の種': '泥种子的获取与用途', '農具一覧': '农具一览',
  '動物用品一覧': '动物用品一览', '品評会の勝ち方': '品评会获胜方法', '猟具一覧': '狩猎工具一览', '狩猟証明一覧': '狩猎证明一览', '家畜一覧': '家畜一览',
  '夜家具一覧': '夜间家具一览', 'セーブのやり方': '保存方法', 'おすすめスキル': '推荐技能', '呪物一覧': '咒物一览', '深夜探索': '深夜探索指南',
  'キャラクリ変更': '修改角色外观', '廃材一覧': '废料一览', 'ヌシの鱗': '主宰之鳞的获取与用途', '祟られたもの': '受诅咒物品与作物', '果実一覧': '水果一览',
  'クリア後要素': '通关后内容', 'エンディング分岐': '结局分支条件', '料理の作り方': '料理制作方法', '改築する方法': '房屋改建方法', '玉手箱の場所': '玉手箱位置',
  '評価レビュー': '评测信息说明', '収穫祭': '收获祭指南', '生け簀の入手方法': '鱼池获取方法', '畑のおすすめ配置': '推荐农田布局',
  '温室の最速解放手順': '温室最快解锁流程', 'お花見': '赏樱活动指南', 'なつき度の上げ方': '动物亲密度提升方法',
  'ヤギの解放条件と入手アイテム': '山羊解锁条件与产物', 'カシミヤヤギの解放条件と入手アイテム': '开司米山羊解锁条件与产物',
  'ブタの解放条件と入手アイテム': '猪解锁条件与产物', 'ウマの解放条件と入手アイテム': '马解锁条件与产物',
  'カラーヒヨコの入手方法と雄鶏の入手アイテム': '彩色小鸡获取方法与公鸡产物',
};

const names: Record<string, string> = { リン: '林', コマコ: '驹子', シロージ: '四郎治', キスケ: '木助', ユータ: '裕太', サザンカ: '茶梅', ロッカク: '六角', ヨウ: '洋', ハスミ: '莲实', スミレ: '堇怜', トバリ: '帷', コンノ: '今野', チナナ: '琪娜娜', ナゴ: '名护' };
const anomaly: Record<string, string> = { '付喪達磨': '付丧达摩', '牛お化け': '牛怪', '天狗': '天狗', '風神雷神': '风神雷神', '百目': '百目', '提灯お化け': '灯笼怪', '野槌': '野槌', '唐傘お化け': '唐伞怪', '雪女': '雪女', 'ヅ主': '毛怪首领' };

const exactHeadings: Record<string, string> = {
  '序盤の効率的な進め方': '前期高效推进顺序', '主人公の見た目を決める': '确定主角外观', '遊ぶゲームモードを選択する': '选择游戏模式',
  '操作方法を学びながらストーリーを進める': '边熟悉操作边推进主线', '自由に過ごして生活を充実させる': '自由安排时间并逐步完善生活设施',
  '依頼をこなして報酬を獲得する': '完成委托获取报酬', '深夜探索して貴重なアイテムを入手': '通过深夜探索获取贵重物品',
  '押さえておきたいポイント': '必须掌握的要点', 'スキルを習得しよう': '尽早学习技能', '帰宅する時は犬の呼び笛を使う': '回家时使用犬之口哨',
  '畑の手入れは怠らない': '不要疏于照料农田', '収納箱と作業台は隣接させる': '让收纳箱紧邻工作台', '1ヶ月は28日までしかない': '每个月只有 28 天',
  '取り返しのつかないこと': '无法挽回的选择', 'ゲームモードの変更はできない': '游戏模式选定后不能修改',
  'ほの暮しモードが本来の遊び方ができるモード': '“静谧生活模式”包含完整的原本玩法', 'あんしん暮しモードは怖いイベントが発生しない': '“安心生活模式”不会触发恐怖事件',
  '主人公の名前': '主角姓名选定后不能更改', '家畜や作物の名前も変更不可': '家畜与作物的命名同样不能更改',
  '取り返しはつくけど注意すべきこと': '可以补救但需要注意的事项', '作物を植えるタイミングに注意': '注意播种时机', '季節を過ぎると作物は枯れてしまう': '跨过适种季节后作物会枯萎',
  '取り返しのつくこと': '可以重新调整的内容', 'コスチュームの変更': '服装可以更换',
  '勾玉の効率的な集め方': '勾玉的高效收集路线', '深夜探索で村の湧きスポットを回る': '深夜巡回村内刷新点', 'だるまさんが出現すると道が塞がってしまう': '达摩出现时道路会被封锁',
  '剣は石切場ボスを倒すと確定入手': '击败采石场首领必定获得剑', '勾玉の入手方法': '勾玉获取方法', '深夜に光る落とし物を拾う': '深夜拾取发光掉落物',
  '雑貨店で購入する': '在杂货店购买', '辻の釣り場にいる妖怪からもらう': '从路口钓场的妖怪处获得', 'ピロのお墓参りをする': '前往皮洛的墓地祭拜',
  '勾玉の使い道': '勾玉用途', '辻の祠でスキルを習得する': '在路口祠堂学习技能',
  '主人公の外見を設定する': '设置主角外观', 'ゲームモードを選択する': '选择游戏模式', '作物を収穫する': '收获作物', 'ニワトリを追いかける': '追赶鸡',
  '穴から出て道なりに進む': '离开洞穴后沿路前进', '村の人に挨拶して回る': '依次向村民打招呼', '家の中にベッドを設置して寝る': '在屋内放置床并睡觉',
  'オノで木を切り倒す': '用斧头砍倒树木', 'ツルハシで全ての石を壊す': '用镐破坏全部石块', 'クワで土を耕す': '用锄头耕地',
  '種を撒く': '播种', 'ジョウロで種に水を撒く': '用洒水壶给种子浇水', 'つくしを食べる': '食用笔头菜', '残りは自由時間': '之后为自由活动时间',
  '特になし': '没有强制事项', '村の人との交流が可能になる': '解锁与村民交流', '雑貨店を訪れる': '前往杂货店', 'コマコから指笛を教わる': '向驹子学习口哨',
  '犬の呼笛を吹く': '吹响犬之口哨', '兵糧丸を作る': '制作兵粮丸', '家畜を飼えるようになる': '解锁饲养家畜',
  '怪異一覧と出現条件': '怪异一览与出现条件', '怪異の倒し方と対処方法': '怪异的击败与应对方法', '怪異を倒すメリット': '击败怪异的收益',
  'カカシや夜家具を入手できる': '可获得稻草人与夜间家具',
};

function chineseTitle(title: string) {
  if (exactTitles[title]) return exactTitles[title];
  if (names[title]) return `${names[title]}角色指南`;
  if (anomaly[title]) return `${anomaly[title]}：出现条件与应对方法`;
  return guideTranslations[title as keyof typeof guideTranslations] ?? title;
}

export function translateHeading(text: string) {
  if (exactHeadings[text]) return exactHeadings[text];
  return guideTranslations[text as keyof typeof guideTranslations] ?? text;
}

export function dataTarget(title: string) {
  if (/キャラ/.test(title)) return '/data/characters/';
  if (/作物|種・苗|花|果実/.test(title)) return '/data/crops/';
  if (/魚/.test(title)) return '/data/fish/';
  if (/機械/.test(title)) return '/data/machines/';
  if (/加工品/.test(title)) return '/data/processes/';
  if (/料理|調味料/.test(title)) return '/data/cooking-recipes/';
  if (/家畜|畜産品/.test(title)) return '/data/livestock/';
  if (/依頼/.test(title)) return '/data/quests/';
  if (/一覧/.test(title)) return '/data/items/';
  return undefined;
}

const outlineMap = new Map(sourceOutlines.outlines.map((row) => [row.sourceId, row.headings]));
export const guides: GuideSource[] = sourceCatalog.sources.map((source) => ({
  ...source,
  chineseTitle: chineseTitle(source.title),
  headings: (outlineMap.get(source.sourceId) ?? []).filter((heading) => !/関連記事|サイト TOP|一覧まとめ|一覧データ|序盤必見|おすすめ$|効率・稼ぎ|注目アイテム|システム解説/.test(heading)),
  dataTarget: dataTarget(source.title),
  guideTarget: guideTarget(source.title),
}));

export const guideCategories = ['总览', '系统与生活', '剧情', '怪异', '探索', '活动', '角色', '数据', '产品'];

export function guideIntro(guide: GuideSource) {
  const intros: Record<string, string> = {
    剧情: '按事件发生顺序整理必要动作、准备事项与解锁内容。以下流程含剧情剧透，建议只展开当前进度。',
    怪异: '按出现信号、触发条件、处理方法与奖励查询。深夜出行前先留出体力与背包空间。',
    角色: '角色姓名采用游戏内中文；礼物喜好与相关委托优先链接本地游戏数据，事件顺序按攻略主题整理。',
    数据: '列表数值由游戏构建 24969282 生成，可继续点击物品、材料、产物和机械查看关联与价格。',
    探索: '按地点与前置条件整理探索目标。涉及夜间区域的条目可能包含轻度剧情剧透。',
    活动: '集中列出举办时间、参加条件、准备重点与容易错过的奖励。',
    产品: '记录版本与平台相关主题；价格、更新状态等可能随时间变化，请同时核对官方信息。',
  };
  return intros[guide.category] ?? '把原攻略主题压缩为可查询的行动清单；数值和物品关系优先引用游戏数据页。';
}
