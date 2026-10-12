import {msg,type Translate} from '../../i18n/translate';
import type {Locale} from '../../i18n/locales';

// Japanese layer terms → Simplified Chinese keys.
// i18n-ignore-next-line
const terms:Record<string,string>={通常:msg('通常'),口開:msg('张嘴'),眼鏡:msg('眼镜'),真剣:msg('认真'),思案:msg('思考'),笑顔:msg('笑脸'),大笑い:msg('大笑'),呆れ:msg('无语'),ムッ:msg('不悦'),気づき:msg('察觉'),驚き:msg('惊讶'),がっかり:msg('失落'),寝顔:msg('睡脸'),悲しみ:msg('悲伤'),疑問:msg('疑问'),叫び:msg('喊叫'),叫ぶ:msg('喊叫'),怒り:msg('生气'),怒る:msg('生气'),大怒り:msg('大怒'),激怒:msg('暴怒'),操られ:msg('被操控'),腕切り:msg('断臂'),腹刺し:msg('腹部受刺'),痛み耐え:msg('忍痛'),痛みに耐える:msg('忍痛'),得意げ:msg('得意'),目そらし:msg('移开目光'),目閉じ:msg('闭眼'),怒り目閉じ:msg('闭眼生气'),酔い:msg('醉酒'),酔い絡み:msg('醉酒纠缠'),真顔:msg('严肃'),酔い寝:msg('醉倒'),酔い笑い:msg('醉笑'),酔い笑顔:msg('醉笑'),酔い叫ぶ:msg('醉酒喊叫'),酔い怒り:msg('醉酒生气'),目押さえ:msg('捂眼'),目押さえ目閉じ:msg('捂眼闭眼'),目押さえ笑顔:msg('捂眼微笑'),目閉じ笑い:msg('闭眼笑'),若い頃:msg('年轻时'),祈り:msg('祈祷'),泣き:msg('哭泣'),大泣き:msg('大哭'),涙:msg('流泪'),笑い泣き:msg('笑着哭'),叫び泣き:msg('哭喊'),困り:msg('为难'),引き攣った笑み:msg('僵硬的笑容'),青ざめ:msg('脸色发青'),呪われ:msg('被诅咒'),怪我:msg('受伤'),失神:msg('昏厥'),心配:msg('担心'),照れ:msg('害羞'),悩み:msg('烦恼'),焦り:msg('焦急'),怯え:msg('害怕'),ビビリ:msg('胆怯'),ビビり:msg('胆怯'),ショック:msg('震惊'),呆然:msg('呆住'),ボロボロ:msg('狼狈'),重症:msg('重伤'),腕痛め:msg('手臂疼痛'),腕痛み:msg('手臂疼痛'),首痛め:msg('颈部疼痛'),苦笑い:msg('苦笑'),感動:msg('感动'),頭抱え:msg('抱头'),濡:msg('淋湿'),うつむき:msg('低头'),ため息:msg('叹气'),やれやれ:msg('无奈'),ツンデレ:msg('傲娇'),ニヤリ:msg('坏笑'),キラキラ:msg('眼神闪亮'),正面:msg('正面'),手広げ:msg('张开双手'),胸に手:msg('手放胸前'),顎に手:msg('托腮'),腕組み:msg('抱臂'),腕おろし:msg('放下手臂'),手振り:msg('挥手'),手振り酔い:msg('醉酒挥手'),タバコ:msg('抽烟'),差し出す:msg('伸手递出'),指さし:msg('指向'),考え事:msg('思索'),提案:msg('提议'),提案腕切り:msg('提议（断臂）'),腕切り鉈:msg('断臂持刀'),操られナイフなし:msg('被操控（无刀）'),決意:msg('决意'),期待:msg('期待'),直立:msg('站直'),帽子なし:msg('无帽'),お嬢様:msg('大小姐姿态'),だらっと:msg('懒散'),テンション:msg('兴奋'),オウム:msg('鹦鹉'),飛び:msg('飞行'),'いけー':msg('上啊'),'おー！':msg('哦！'),'やぁ':msg('打招呼'),'んー':msg('嗯…'),'ふーん':msg('哼…'),'へぇ～':msg('哦～'),'ハッ…':msg('猛然察觉'),'FX溶けた顔':msg('呆滞脸'),'FX溶かし顔':msg('呆滞脸')};
/**
 * Pose and face names come from the game's Japanese layer labels. Japanese
 * pages show them as-is; Chinese pages translate the known terms.
 */
export function portraitLabel(value:string,t:Translate,locale:Locale){
  const parts=value.split('_').slice(2).filter(part=>part!=='L'&&part!=='R');
  if(locale==='ja')return parts.join(' · ')||'通常'; // i18n-ignore — game label
  return parts.map(part=>terms[part]?t(terms[part]):part).join(' · ')||t('通常');
}
