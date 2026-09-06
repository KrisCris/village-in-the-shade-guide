export const portraitNotice='立绘可能涉及游戏后期内容剧透或者废案，请谨慎切换。';
export const portraits = [
  ['YOUNG_MAN','BU_0120','裕太',15,1010], ['SECRETARY','BU_0090','今野',12,1010],
  ['OLD_MAN','BU_0080','六角',10,1000], ['GIRL','BU_0110','洋',10,1000],
  ['FEMALE_DOCTOR','BU_0140','莲实',11,1000], ['HUNTER','BU_0060','驹子',10,1010],
  ['CITY_HALL_STAFF','BU_0100','名护',15,1000], ['ORPHAN','BU_0020','帷',11,1200],
  ['VILLAGE_HEAD','BU_0050','林',12,1040], ['LUMBERJACK','BU_0040','四郎治',10,1000],
  ['CARPENTER','BU_0030','木助',12,1000], ['BOY','BU_0130','堇怜',11,1040],
  ['STREET_VENDOR','BU_0150','琪娜娜',15,1010], ['GENERAL_STORE_MANAGER','BU_0070','茶梅',11,1010],
].map(([id,resource,name,pose,face])=>({id:`CHARA_ID_${id}`,resource:String(resource),name:String(name),pose:Number(pose),face:Number(face)}));
export const hiddenLayers:Record<string,string[]>={
  BU_0090:['ban01'], BU_0030:['hotai01','glass02'], BU_0050:['hair02'],
  BU_0110:['pos01','pos02'], BU_0080:['pos01'], BU_0100:['beard'],
};
export type PortraitDefinition=typeof portraits[number];
