export function filename(date = new Date()) {
  const part = (value) => String(value).padStart(2, '0');
  return `framed-${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}.png`;
}
