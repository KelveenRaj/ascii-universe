// Your ship, flat shaded into the scene buffer like the bodies: R brightness (scene HDR units),
// G 0 (no stars through the hull), B palette row, A 0. Parts: 0 hull, 1 trim, 2 glow (see model.ts).
precision highp float;

uniform vec3 uKey;   // towards the key light (the star, the core, the flow)
uniform vec3 uFill;  // towards a dim fill from over the viewer's shoulder
uniform float uGlow; // engine nozzle brightness
uniform vec3 uRows;  // palette rows: hull, trim, glow

in vec3 vNormal;
in vec3 vToEye;
flat in int vPart;

out vec4 fragColor;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vToEye);
  // thin plates are seen from both sides
  if (dot(n, v) < 0.0) n = -n;

  float brightness;
  float row;
  if (vPart == 2) {
    brightness = uGlow;
    row = uRows.z;
  } else {
    float albedo = vPart == 0 ? 1.0 : 0.62;
    float key = max(dot(n, uKey), 0.0);
    float fill = max(dot(n, uFill), 0.0);
    // the outline, so a ship against the dark never vanishes
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.0);
    brightness = albedo * (0.07 + 1.05 * key + 0.2 * fill) + 0.28 * rim;
    row = vPart == 0 ? uRows.x : uRows.y;
  }
  fragColor = vec4(brightness, 0.0, row, 0.0);
}
