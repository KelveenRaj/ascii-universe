// Pass 3: draw the low-res scene as pixel-perfect 8×8 glyphs, one character cell per scene texel
// (or per 2×2 texels when supersampled: sampling the shared corner with LINEAR filtering averages
// them for free).
precision highp float;
precision highp int;

uniform sampler2D uScene;
uniform sampler2D uLut;
uniform sampler2D uAtlas;
uniform sampler2D uBloom;   // blurred bright tones, one texel per cell (see blur.frag)
uniform float uBloomStrength; // 0 = off
uniform vec2 uGrid;       // columns, rows
uniform vec2 uGridOffset; // drawing-buffer pixels left/below the grid (it is centred)
uniform float uCellPx;    // cell size in drawing-buffer pixels (8 × glyph scale)
uniform float uExposure;
uniform float uRampLength;
uniform float uStarBase;
uniform float uStarLength;
uniform vec3 uStarTint;
uniform vec3 uBackground;
uniform sampler2D uText;     // text layer: labels, brackets, game sprites (see lib/text.glsl)
uniform float uTextBase;     // atlas index of the first text glyph
uniform vec3 uTextColors[4]; // bright, normal, dim, accent

out vec4 fragColor;

#include lib/glyphmap.glsl;
#include lib/palette.glsl;
#include lib/text.glsl;

void main() {
  vec2 p = (gl_FragCoord.xy - uGridOffset) / uCellPx;
  vec2 cell = floor(p);
  if (any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, uGrid))) {
    fragColor = vec4(uBackground, 1.0);
    return;
  }

  vec4 scene = texture(uScene, (cell + 0.5) / uGrid);
  vec2 glyph = glyphFor(scene);
  // text replaces the scene glyph in its cell
  vec2 text = textAt(ivec2(cell));
  bool isText = text.x >= 0.0;
  if (isText) glyph.x = text.x;
  // first scene texel of this cell (cells are 1×1 or 2×2 texels)
  ivec2 texelsPerCell = textureSize(uScene, 0) / ivec2(uGrid);
  float material = materialRow(ivec2(cell) * texelsPerCell);

  // pixel inside the 8×8 glyph; atlas rows are stored top row first
  ivec2 inCell = ivec2(floor((p - cell) * 8.0));
  ivec2 texel = ivec2(int(glyph.x) * 8 + inCell.x, 7 - inCell.y);
  float ink = texelFetch(uAtlas, texel, 0).r;

  float t = tonemap(scene.r);
  vec3 inkColor = glyph.y == 2.0
    ? uStarTint * (0.55 + 0.45 * starTone(scene.g))
    : lut(pow(t, 0.85), material); // colour runs slightly ahead so dim glyphs stay readable
  if (isText) inkColor = uTextColors[int(clamp(text.y, 0.0, 3.0))];

  // shadow cells (scene.g < 0) are pure black, sky cells get the palette background
  vec3 paper = scene.g < 0.0 ? vec3(0.0) : uBackground;
  vec3 col = mix(paper, inkColor, ink);

  // phosphor glow: sampled smoothly across cells so it bleeds between glyphs
  if (uBloomStrength > 0.0) {
    vec2 b = texture(uBloom, p / uGrid).rg;
    vec3 glow = lut(mix(0.55, 1.0, b.r), material) * b.r + uStarTint * b.g * 0.25;
    col += glow * uBloomStrength * (1.0 - 0.5 * ink);
  }
  fragColor = vec4(col, 1.0);
}
