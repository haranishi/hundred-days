const LABELS = {
  traffic: '交通', town: '街', outdoor: '屋外', building: '建物', parking: '駐車場',
  shop: '店舗', public: '公共', weather: '気象', river: '河川', beach: '海岸',
  ski: 'スキー場', airport: '空港', harbour: '港',
};

export function zoneLabel(zone) {
  return LABELS[zone] || zone;
}
