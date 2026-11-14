// Copy-as-text: one fragment per character cell, writing the glyph index the ASCII pass would draw
// there. Uses the same glyphmap.glsl and the same scene sampling as ascii.frag, so the exported
// text matches the screen exactly.
precision highp float;

uniform sampler2D uScene;
uniform vec2 uGrid; // columns, rows (this pass renders at exactly that size)
uniform float uExposure;
uniform float uRampLength;
uniform float uStarBase;
uniform float uStarLength;
uniform sampler2D uText;
uniform float uTextBase;

out vec4 fragColor;

#include lib/glyphmap.glsl;
#include lib/text.glsl;

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 glyph = glyphFor(texture(uScene, (cell + 0.5) / uGrid));
  vec2 text = textAt(ivec2(cell));
  if (text.x >= 0.0) glyph.x = text.x; // text layer wins, as on screen
  // atlas indices must fit in a byte (ramp ≤ 70 + stars + 99 text glyphs = well under 256)
  fragColor = vec4(glyph.x / 255.0, glyph.y / 255.0, 0.0, 1.0);
}
