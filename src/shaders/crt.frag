// Pass 4: CRT finishing. Reads the full-resolution ASCII image and adds tube curvature, chromatic
// aberration, scanlines, an aperture-grille phosphor mask, vignette and a little flicker/noise.
// Every effect scales with its own uniform; 0 switches it off.
precision highp float;
precision highp int;

uniform sampler2D uImage;
uniform vec2 uResolution;  // drawing-buffer pixels
uniform float uTime;
uniform float uGlyphPx;    // device pixels per glyph pixel (the glyph scale)
uniform float uCurvature;  // 0..1
uniform float uChromatic;  // 0..1
uniform float uScanlines;  // 0..1
uniform float uMask;       // 0..1
uniform float uVignette;   // 0..1
uniform float uFlicker;    // 0..1

in vec2 vUv;
out vec4 fragColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// barrel distortion: pushes the image outward toward the corners, like a curved tube
vec2 curve(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c += c * (c.yx * c.yx) * (0.16 * uCurvature);
  return c * 0.5 + 0.5;
}

void main() {
  vec2 uv = curve(vUv);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // chromatic aberration grows toward the edges of the tube
  vec2 fromCentre = uv - 0.5;
  vec2 ca = fromCentre * length(fromCentre) * (uChromatic * 10.0) / uResolution;
  vec3 col = vec3(
    texture(uImage, uv + ca).r,
    texture(uImage, uv).g,
    texture(uImage, uv - ca).b
  );

  // scanlines follow the tube curvature; one line per glyph pixel row (at least 2 device px)
  float period = max(2.0, uGlyphPx);
  float y = uv.y * uResolution.y - 0.5;
  float scan = 0.5 + 0.5 * cos(6.28318530718 * y / period);
  col *= mix(1.0, 0.55 + 0.45 * scan, uScanlines) * (1.0 + 0.18 * uScanlines);

  // aperture-grille phosphor mask: vertical R, G, B stripes
  float stripe = mod(floor(gl_FragCoord.x), 3.0);
  vec3 mask = stripe < 1.0 ? vec3(1.0, 0.6, 0.6) : stripe < 2.0 ? vec3(0.6, 1.0, 0.6) : vec3(0.6, 0.6, 1.0);
  col *= mix(vec3(1.0), mask * 1.25, uMask);

  // vignette, plus soft corners when the tube is curved
  float v = 16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
  col *= mix(1.0, pow(v, 0.3), uVignette);
  vec2 edge = smoothstep(vec2(0.0), vec2(0.004 + 0.01 * uCurvature), min(uv, 1.0 - uv));
  col *= edge.x * edge.y;

  // gentle mains-hum flicker and grain
  col *= 1.0 + uFlicker * 0.025 * sin(uTime * 113.0);
  col += uFlicker * 0.03 * (hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 911.0) - 0.5);

  fragColor = vec4(max(col, 0.0), 1.0);
}
