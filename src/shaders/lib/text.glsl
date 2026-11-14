// Text layer lookup, shared by ascii.frag (drawing) and readback.frag (copy as text), so exported
// text always matches the screen. See src/engine/display/TextLayer.ts.
//
// uText is an RG8 texture, one texel per character cell (GL order, bottom row first):
//   R = code: 0 = no text, n = TEXT_CHARS[n - 1], which sits at atlas index uTextBase + n - 1
//   G = style index (bright, normal, dim, accent)
//
// Expects in the including shader: uniform sampler2D uText; uniform float uTextBase.

// Returns vec2(atlas glyph index, style index), or vec2(-1.0) when the cell has no text.
vec2 textAt(ivec2 cell) {
  if (any(greaterThanEqual(cell, textureSize(uText, 0)))) return vec2(-1.0);
  vec2 t = floor(texelFetch(uText, cell, 0).rg * 255.0 + 0.5);
  return t.x > 0.0 ? vec2(uTextBase + t.x - 1.0, t.y) : vec2(-1.0);
}
