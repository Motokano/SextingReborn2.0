// Same vertical-preserving registration used by the canteen renderer.
// Input slopes belong to horizontal edges in the source illustration.
// This is a display transform around the object's ground anchor, not a PNG edit.
export function groundRegistration(slopes) {
  if (!slopes) return [1, 0, 0, 1, 0, 0];
  const [u, v] = slopes;
  if (!(Number.isFinite(u) && Number.isFinite(v) && u > 0 && v < 0)) {
    throw new Error('Invalid source ground axes');
  }
  const d = Math.SQRT2 / (u - v);
  return [1, Math.SQRT1_2 - d * u, 0, d, 0, 0];
}
