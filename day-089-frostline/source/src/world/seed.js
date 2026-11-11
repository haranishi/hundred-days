/** Stable unsigned string hash and avalanche (also used by obstacle cells). */
export function hashString(value) {
  let h=2166136261;
  for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);
  return h>>>0;
}
export function hashInt(x) {
  x=Math.imul(x^(x>>>16),0x7feb352d); x=Math.imul(x^(x>>>15),0x846ca68b);
  return (x^(x>>>16))>>>0;
}
export function randomStream(seed) {
  let state=seed>>>0;
  return function next(){state=(state+0x6d2b79f5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
