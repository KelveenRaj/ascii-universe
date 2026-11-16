// Accretion flow models. Units: r_s = 1, M = 0.5. Needs noise.glsl.
//
// Thin Keplerian accretion disk in the y = 0 plane (the "thin" flow).

const float SWIRL_PERIOD = 40.0; // anti-winding crossfade period, in disk-time units

// One layer of swirling gas. `ph` is the azimuth already advanced by differential rotation.
float swirlLayer(float ph, float r, float seed) {
  float lr = log(r);
  vec3 p = vec3(cos(ph) * 2.2, sin(ph) * 2.2, lr * 5.0 + seed);
  float n = fbm(p + seed);
  float streak = gnoise(vec3(cos(ph) * 7.0, sin(ph) * 7.0, lr * 22.0 + seed * 1.3));
  return clamp(0.5 + 0.55 * n + 0.22 * streak, 0.0, 1.0);
}

// Returns vec3(observed intensity, opacity, g) for a ray crossing the disk plane at `hit`.
// `rayDir` is the traced direction (camera → scene); photons travel the opposite way.
vec3 diskShade(vec3 hit, vec3 rayDir, float time, float rIn, float rOut, float beamExp) {
  float r = length(hit.xz);
  float phi = atan(hit.z, hit.x);

  // Novikov–Thorne-like emissivity ~ T^4 ∝ r^-3 (1 - sqrt(rIn / r)), normalised to peak 1
  float rPeak = rIn * 49.0 / 36.0;
  float norm = (rPeak * rPeak * rPeak) / (1.0 - sqrt(rIn / rPeak));
  float emit = norm * max(1.0 - sqrt(rIn / r), 0.0) / (r * r * r);
  float outerFade = smoothstep(rOut, rOut * 0.72, r);

  // Swirl: Keplerian differential rotation (Ω = sqrt(M / r^3)). Two layers whose clocks reset
  // half a period apart are crossfaded, so the shear never winds the noise into thin rings.
  float omega = 0.70710678 * pow(r, -1.5);
  float t1 = mod(time, SWIRL_PERIOD);
  float t2 = mod(time + 0.5 * SWIRL_PERIOD, SWIRL_PERIOD);
  float w1 = 1.0 - abs(2.0 * t1 / SWIRL_PERIOD - 1.0);
  float n = mix(swirlLayer(phi - omega * t2, r, 17.0), swirlLayer(phi - omega * t1, r, 0.0), w1);

  // Relativistic beaming: orbital speed seen by a static observer, plus gravitational redshift
  vec3 vDir = normalize(vec3(-hit.z, 0.0, hit.x));
  float beta = min(sqrt(0.5 / max(r - 1.0, 1e-3)), 0.99);
  float gammaL = inversesqrt(1.0 - beta * beta);
  float doppler = 1.0 / (gammaL * (1.0 + beta * dot(vDir, rayDir)));
  float g = doppler * sqrt(max(1.0 - 1.0 / r, 0.0));

  float intensity = emit * (0.3 + 1.4 * n) * pow(g, beamExp) * outerFade;
  float alpha = mix(0.55, 0.97, n) * outerFade * smoothstep(rIn * 0.98, rIn * 1.06, r);
  return vec3(intensity, alpha, g);
}

// ---------------------------------------------------------------------------------------------
// Thick, optically thin RIAF (radiatively inefficient accretion flow), after the semi-analytic
// models used to interpret EHT data (Broderick & Loeb 2006; Broderick et al. 2011): emissivity
// j ∝ r^-p · exp(-z² / 2H²) with H ∝ ρ (cylindrical radius), integrated along each marched ray.
// Observed intensity I = Σ j · g^(3+α) · ds, so the ring, the shadow and the photon ring all come
// out of the geodesics: rays that skim the photon sphere (r ≈ 1.5) spend a long path inside the
// hot gas and pile up brightness, rays that fall in collect only the gas in front of the hole.

const float R_ISCO = 3.0;
const float E_ISCO = 0.94280904; // specific energy at the ISCO, sqrt(8/9)
const float L_ISCO = 1.73205081; // specific angular momentum at the ISCO, 2√3 M with M = 0.5
// Radial emissivity slope: roughly the 230 GHz synchrotron falloff of the Broderick & Loeb
// profile (n_e ∝ r^-1.1, T_e ∝ r^-0.84).
const float EMIS_POWER = 3.0;

// Hot spot: GRAVITY 2018 saw flares orbit at ~6–10 r_g (3–5 r_s) with a ~45 min period, near
// face-on. At r = 4 r_s the Keplerian period is 71 r_s/c, about 50 min for Sgr A*.
const float SPOT_R = 4.0;
const float SPOT_SIGMA = 0.45;
const float SPOT_AMP = 0.25;
const float SPOT_OMEGA = 0.08838835; // sqrt(M / SPOT_R^3)
const float SPOT_FLARE_PERIOD = 213.0; // ~3 orbits: the spot brightens and fades like a flare

// Frequency ratio g = ν_obs / ν_emit for gas at `pos` (spherical radius r).
//   lz: the photon's angular momentum about the flow's spin axis, per unit energy
//   b2: the photon's total impact parameter squared
//   photonOut: the photon is moving away from the hole here
// Outside the ISCO the gas is on Keplerian circles, Ω = sqrt(M / r³), constant on spherical
// shells; inside it plunges with the ISCO's energy and angular momentum (Schwarzschild
// geodesic). Includes gravitational redshift; the camera is treated as a distant observer.
float flowG(vec3 pos, float r, float lz, float b2, bool photonOut) {
  float f = 1.0 - 1.0 / r;
  float denom;
  if (r >= R_ISCO) {
    float omega2 = 0.5 / (r * r * r);
    float ut = inversesqrt(max(f - dot(pos.xz, pos.xz) * omega2, 1e-4));
    denom = ut * (1.0 - sqrt(omega2) * lz);
  } else {
    float ut = E_ISCO / f;
    float uphi = L_ISCO / (r * r);
    float ur = -sqrt(max(E_ISCO * E_ISCO - f * (1.0 + L_ISCO * L_ISCO / (r * r)), 0.0));
    float kr = sqrt(max(1.0 - f * b2 / (r * r), 0.0)) / f;
    if (!photonOut) kr = -kr;
    denom = ut - lz * uphi - kr * ur;
  }
  return min(1.0 / max(denom, 0.05), 3.0);
}

// Brightness envelope of the hot spot's flare at `time`: 0.3 (quiet) to 1 (peak).
float spotFlare(float time) {
  float c = 0.5 + 0.5 * cos(6.2831853 * time / SPOT_FLARE_PERIOD);
  return 0.3 + 0.7 * c * c;
}

// Rest-frame emissivity (arbitrary units) of the RIAF at `pos`, spherical radius r.
float riafEmissivity(
  vec3 pos,
  float r,
  float time,
  float thickness,
  float rOut,
  bool hotspot
) {
  float j = 0.0;
  float rho2 = dot(pos.xz, pos.xz);
  float h = max(thickness * sqrt(rho2), 0.05);
  float vert = exp(-0.5 * pos.y * pos.y / (h * h));
  float outerFade = smoothstep(rOut, rOut * 0.72, r);
  if (vert * outerFade > 0.004) {
    // Keplerian-sheared turbulence, as on the thin disk, decorrelated with height
    float phi = atan(pos.z, pos.x);
    float omega = 0.70710678 * pow(r, -1.5);
    float t1 = mod(time, SWIRL_PERIOD);
    float t2 = mod(time + 0.5 * SWIRL_PERIOD, SWIRL_PERIOD);
    float w1 = 1.0 - abs(2.0 * t1 / SWIRL_PERIOD - 1.0);
    float zs = 1.5 * pos.y / r;
    float n = mix(
      swirlLayer(phi - omega * t2, r, 17.0 + zs),
      swirlLayer(phi - omega * t1, r, zs),
      w1
    );
    j = pow(r, -EMIS_POWER) * vert * outerFade * (0.3 + 1.4 * n);
  }
  if (hotspot) {
    float ph = SPOT_OMEGA * time;
    vec3 d = pos - SPOT_R * vec3(cos(ph), 0.0, sin(ph));
    j += SPOT_AMP * spotFlare(time) * exp(-0.5 * dot(d, d) / (SPOT_SIGMA * SPOT_SIGMA));
  }
  return j;
}
