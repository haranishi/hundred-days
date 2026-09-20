/* 同梱データに区が無い政令市だけ、市へ寄せる。東京23区は直接一致する。 */
export const DESIGNATED_CITIES = [
  '01100', '04100', '11100', '12100', '14100', '14130', '14150', '15100',
  '22100', '22130', '23100', '26100', '27100', '27140', '28100', '33100',
  '34100', '40100', '40130', '43100'
];
export function resolveTown(code, places) {
  if (!/^\d{7}$/.test(code)) return null;
  const town = code.slice(0, 5);
  if (places.some((place) => place.c === town)) return town;
  return DESIGNATED_CITIES.filter((city) => city.slice(0, 2) === town.slice(0, 2) && city <= town).at(-1) ?? null;
}
