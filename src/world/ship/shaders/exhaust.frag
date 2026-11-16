// The exhaust, max-blended over the scene: brightest at the nozzle, fading to nothing at the tip.
precision highp float;

uniform float uBright;
uniform float uRow; // the glow row

in float vT;

out vec4 fragColor;

void main() {
  float b = uBright * pow(1.0 - vT, 1.6);
  if (b < 0.06) discard; // leave the scene's own colour where the flame is faint
  fragColor = vec4(b, 0.0, uRow, 0.0);
}
