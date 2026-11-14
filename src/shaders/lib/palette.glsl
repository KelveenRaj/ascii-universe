// Palette lookup shared by ascii.frag and present.frag.
//
// uLut is LUT_SIZE × N: row i is the colour ramp of the active scene's material i (or the terminal
// palette's ramp on every row). The scene writes the material index into the scene buffer's B
// channel; it is read per texel with texelFetch, never through the linear filter, so neighbouring
// materials never blend into an in-between row.
//
// Expects in the including shader: uniform sampler2D uLut, uScene.

// Material row stored at one scene-buffer texel, clamped to the rows that exist.
float materialRow(ivec2 sceneTexel) {
  float rows = float(textureSize(uLut, 0).y);
  return clamp(floor(texelFetch(uScene, sceneTexel, 0).b + 0.5), 0.0, rows - 1.0);
}

// Colour at brightness t ∈ [0, 1] along a material's ramp.
vec3 lut(float t, float row) {
  vec2 size = vec2(textureSize(uLut, 0));
  vec2 uv = vec2((clamp(t, 0.0, 1.0) * (size.x - 1.0) + 0.5) / size.x, (row + 0.5) / size.y);
  return texture(uLut, uv).rgb;
}
