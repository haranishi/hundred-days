// GLSL版FNV-1aを定義のXOR/素数乗算から実装。参考コードは転載していない。
// FNVの数学的定義: https://www.ietf.org/archive/id/draft-eastlake-fnv-34.html (work in progress)
export const HASH_GLSL = /* glsl */ `
float drHashScalar(vec3 point, uint salt) {
  uvec3 words = floatBitsToUint(point);
  uint h = 2166136261u ^ salt;
  for (int axis = 0; axis < 3; axis++) {
    uint word = words[axis];
    for (int byte = 0; byte < 4; byte++) {
      h = (h ^ (word & 255u)) * 16777619u;
      word >>= 8;
    }
  }
  return float(h >> 8) / 16777216.0;
}
`;
