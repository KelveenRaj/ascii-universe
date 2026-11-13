// Pass 3: draw the low-res scene as pixel-perfect 8×8 glyphs, one character cell per scene texel
// (or per 2×2 texels when supersampled: sampling the shared corner with LINEAR filtering averages
// them for free).
precision highp float;
precision highp int;

uniform sampler2D uScene;
uniform sampler2D uLut;
uniform sampler2D uAtlas;
uniform vec2 uGrid;       // columns, rows
uniform vec2 uGridOffset; // drawing-buffer pixels left/below the grid (it is centred)
uniform float uCellPx;    // cell size in drawing-buffer pixels (8 × glyph scale)
uniform float uExposure;
uniform float uRampLength;
uniform float uStarBase;
uniform float uStarLength;
uniform vec3 uStarTint;
uniform vec3 uBackground;

out vec4 fragColor;

#include lib/glyphmap.glsl;

const float LUT_SIZE = 256.0;

vec3 lut(float t) {
  return texture(uLut, vec2((clamp(t, 0.0, 1.0) * (LUT_SIZE - 1.0) + 0.5) / LUT_SIZE, 0.5)).rgb;
}

void main() {
  vec2 p = (gl_FragCoord.xy - uGridOffset) / uCellPx;
  vec2 cell = floor(p);
  if (any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, uGrid))) {
    fragColor = vec4(uBackground, 1.0);
    return;
  }

  vec4 scene = texture(uScene, (cell + 0.5) / uGrid);
  vec2 glyph = glyphFor(scene);

  // pixel inside the 8×8 glyph; atlas rows are stored top row first
  ivec2 inCell = ivec2(floor((p - cell) * 8.0));
  ivec2 texel = ivec2(int(glyph.x) * 8 + inCell.x, 7 - inCell.y);
  float ink = texelFetch(uAtlas, texel, 0).r;

  float t = tonemap(scene.r);
  vec3 inkColor = glyph.y == 2.0
    ? uStarTint * (0.55 + 0.45 * starTone(scene.g))
    : lut(pow(t, 0.85)); // colour runs slightly ahead of the glyph so dim glyphs stay readable

  // shadow cells (scene.g < 0) are pure black, sky cells get the palette background
  vec3 paper = scene.g < 0.0 ? vec3(0.0) : uBackground;
  fragColor = vec4(mix(paper, inkColor, ink), 1.0);
}
