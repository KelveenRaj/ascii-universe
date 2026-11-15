// The Milky Way's density: emission of old stars, young stars and gas, and dust, at a point.
// Shared by the Milky Way overview and (later) the open-world galaxy layer.
//
// Units: kly, galactic centre at the origin, disk in the XZ plane. The includer declares these
// uniforms (values from src/scenes/milky-way/layout.ts): uAngle, uArmContrast, uDust,
// uDiskRadius, uBarHalfLength, uBarAngle, uPitch. It must also include noise.glsl (for gnoise).
// The large-scale shape (disk, bulge, bar, arms) will be mirrored on the CPU for placing star
// systems; change both together.

vec2 rot(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

// Emission of old stars, young stars and gas (x, y, z) and dust density (w) at a point.
vec4 galaxy(vec3 p) {
  vec2 q = rot(p.xz, uAngle); // into the galaxy's own frame (it turns as uAngle grows)
  float R = length(q);
  float y = abs(p.y);
  float theta = atan(q.y, q.x);

  // old stars: a round bulge, the bar, and a smooth exponential disk
  float rb = length(vec3(q.x, p.y * 1.4, q.y));
  float bulge = 0.9 * exp(-rb / 1.0);
  vec2 qb = rot(q, -uBarAngle);
  float barShape = length(vec2(qb.x / uBarHalfLength, qb.y / (0.32 * uBarHalfLength)));
  float bar = 0.7 * exp(-barShape * barShape * 2.2) * exp(-y / 0.7);
  float disk = 0.35 * exp(-R / 12.0) * exp(-y / 1.1);
  float edge = smoothstep(uDiskRadius, uDiskRadius * 0.8, R);

  // four logarithmic arms: two major ones starting at the bar's ends, two minor ones between
  float k = 1.0 / tan(uPitch);
  float psi = theta - uBarAngle - k * log(max(R, 0.5) / uBarHalfLength);
  float major = pow(0.5 + 0.5 * cos(2.0 * psi), 6.0);
  float minor = pow(0.5 + 0.5 * cos(2.0 * psi + 3.14159265), 7.0);
  float arms = (major + 0.6 * minor) * smoothstep(uBarHalfLength * 0.7, uBarHalfLength * 1.1, R);
  // star-forming clumps break the arms up
  float n = gnoise(vec3(q * 0.28, 1.3)) * 0.65 + gnoise(vec3(q * 0.7, 7.1)) * 0.35;
  float clumps = clamp(0.55 + 0.9 * n, 0.0, 1.6);
  float thin = exp(-y / 0.35);
  float armFade = exp(-R / 30.0) * edge;
  float young = uArmContrast * 3.2 * arms * clumps * thin * armFade;
  float gas = uArmContrast * 7.0 * arms * arms * pow(max(n, 0.0), 3.0) * thin * armFade;

  // dust lanes hug the inner (concave) edge of each arm
  float lanePsi = psi + 0.22;
  float lanes = pow(0.5 + 0.5 * cos(2.0 * lanePsi), 10.0) + 0.6 * pow(0.5 + 0.5 * cos(2.0 * lanePsi + 3.14159265), 10.0);
  float dust = uDust * (0.9 * lanes * smoothstep(4.0, 10.0, R) + 0.12) * exp(-y / 0.6) * exp(-R / 25.0) * edge;

  return vec4((bulge + bar + disk) * edge, young, gas, dust);
}
