// OpenStreetMap の公衆浴場を5つの種類に分ける。
// bath:type が書かれていれば従い、無ければ名前から判断する。どちらでも決まらないものは other。
// 「〇〇湯」は銭湯のことも温泉のこともある（東京の「金春湯」は銭湯、秋田の「鶴の湯」は温泉）ので、
// 名前が「湯」なだけでは銭湯と決めない。

export const TYPES = ['onsen', 'sento', 'super', 'foot', 'other'];

// other は「判断できなかった」もの。名前から銭湯と推測はしないので、画面では「種類の登録なし」と書く
export const TYPE_LABELS = {
  onsen: '温泉',
  sento: '銭湯',
  super: 'スーパー銭湯など',
  foot: '足湯・手湯',
  other: '種類の登録なし',
};

const TAG_TYPES = new Map([
  ['onsen', 'onsen'],
  ['hot_spring', 'onsen'],
  ['thermal', 'onsen'],
  ['sento', 'sento'],
  ['super_sento', 'super'],
  ['foot_bath', 'foot'],
  ['hand_bath', 'foot'],
  ['finger_bath', 'foot'],
]);

// bath:type は「foot_bath;hand_bath」のように複数入ることがある。先頭から順に見て、知っている値を採る
function typeFromTag(value) {
  if (typeof value !== 'string') return null;
  for (const part of value.split(';')) {
    const type = TAG_TYPES.get(part.trim());
    if (type) return type;
  }
  return null;
}

function typeFromName(name) {
  if (!name) return null;
  if (/足湯|手湯/.test(name)) return 'foot';
  if (/スーパー銭湯|健康ランド|スパ/.test(name)) return 'super';
  if (/銭湯/.test(name)) return 'sento';
  if (/温泉|源泉/.test(name)) return 'onsen';
  return null;
}

export function displayName(tags = {}) {
  const raw = tags['name:ja'] || tags.name || '';
  // 「木浦名水館;唄げんかの湯」のように施設名と浴場名が ; でつながっていることがある
  return raw.split(';').map((part) => part.trim()).filter(Boolean).join('・');
}

// 返り値の how は画面の注記に使う。tag=種類の登録あり／name=名前から判断／none=判断できず
export function classify(tags = {}) {
  const fromTag = typeFromTag(tags['bath:type']);
  if (fromTag) return { type: fromTag, how: 'tag' };
  const fromName = typeFromName(displayName(tags));
  if (fromName) return { type: fromName, how: 'name' };
  return { type: 'other', how: 'none' };
}

// 地図に載せない条件。閉業や私用の印が付いたものは外す
export function exclusionReason(tags = {}) {
  if (['private', 'no'].includes(tags.access)) return 'access';
  if (tags.disused === 'yes' || tags.abandoned === 'yes' || tags['disused:amenity'] || tags['abandoned:amenity']) return 'disused';
  return null;
}
