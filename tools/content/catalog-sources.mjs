import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';

const homeUrl = 'https://appmedia.jp/honogurashi';
const outputPath = 'data/sources/appmedia-honogurashi.json';
const response = await fetch(homeUrl, { headers: { 'user-agent': 'VillageInTheShadeGuide/1.0 (personal reference catalog)' } });
if (!response.ok) throw new Error(`AppMedia returned ${response.status}`);
const $ = load(await response.text());
let previous = [];
try { previous = JSON.parse(await readFile(outputPath, 'utf8')).sources; } catch {}
const firstSeen = new Map(previous.map((row) => [row.url, row.firstSeen]));
const found = new Map();

function clean(text) { return text.replace(/\s+/g, ' ').replace(/〖ほの暮しの庭〗/g, '').trim(); }
function category(title) {
  if (/春月|夏月|秋月|冬月|攻略チャート|エンディング|クリア後/.test(title)) return '剧情';
  if (/怪異|達磨|百目|お化け|野槌|天狗|ヅ主|風神|雪女/.test(title)) return '怪异';
  if (['リン', 'コマコ', 'シロージ', 'キスケ', 'ユータ', 'サザンカ', 'ロッカク', 'ヨウ', 'ハスミ', 'スミレ', 'トバリ', 'コンノ', 'チナナ', 'ナゴ'].includes(title) || /キャラ|好感度|依頼/.test(title)) return '角色';
  if (/一覧/.test(title)) return '数据';
  if (/発売日|レビュー|機種|エディション|アプデ/.test(title)) return '产品';
  if (/場所|探索|採掘|玉手箱|社|ネズミ|部品/.test(title)) return '探索';
  if (/祭|お花見|品評会|縁日/.test(title)) return '活动';
  return '系统与生活';
}

$('a[href]').each((_, node) => {
  const raw = $(node).attr('href');
  if (!raw) return;
  let url;
  try { url = new URL(raw, homeUrl); } catch { return; }
  const match = url.pathname.match(/^\/honogurashi\/(\d+)\/?$/);
  if (!match) return;
  url.hash = ''; url.search = ''; url.pathname = `/honogurashi/${match[1]}`;
  const canonical = url.toString();
  const title = clean($(node).text()) || clean($(node).attr('title') ?? '') || clean($(node).find('img').attr('alt') ?? '');
  const existing = found.get(canonical);
  if (!existing || title.length > existing.title.length) found.set(canonical, { sourceId: match[1], title, url: canonical });
});

const today = new Date().toISOString().slice(0, 10);
const detailSources = [...found.values()].map((row) => {
  const title = row.title || `AppMedia 条目 ${row.sourceId}`;
  return { ...row, title, category: category(title), firstSeen: firstSeen.get(row.url) ?? today, lastChecked: today };
}).sort((a, b) => Number(a.sourceId) - Number(b.sourceId));
const sources = [{ sourceId: 'home', title: 'ほの暮しの庭攻略', url: homeUrl, category: '总览', firstSeen: firstSeen.get(homeUrl) ?? today, lastChecked: today }, ...detailSources];
await mkdir('data/sources', { recursive: true });
await writeFile(outputPath, JSON.stringify({ homeUrl, catalogedAt: new Date().toISOString(), count: sources.length, sources }, null, 2) + '\n');
console.log(`cataloged sources=${sources.length}`);
if (sources.length < 116) throw new Error(`Expected at least 116 source topics, got ${sources.length}`);
