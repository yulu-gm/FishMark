// Ember Ascend — workbench backdrop.
// Adapted from "Ascend" by bµg (CC BY-NC-SA 4.0)
//   https://www.shadertoy.com/view/33KBDm
// The original is a 463-char golfed volumetric flame column. This port expands
// the comma-chain macros into explicit statements so the WebGL1 GLSL ES 1.0
// unroller doesn't choke, reduces the outer sample count to a number ANGLE
// can handle comfortably, and routes exposure / warmth / motion through
// theme uniforms.
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 iResolution;
uniform float iTime;

uniform float u_glowStrength;
uniform float u_colorWarmth;
uniform float u_enableBreathe;

vec2 resolveResolution() {
  return iResolution.x > 0.0 ? iResolution.xy : u_resolution;
}

float resolveTime() {
  return iTime > 0.0 ? iTime : u_time;
}

// Tiny procedural noise lobe built from axis-aligned sines; used to deform
// the column surface distance `d` and the soft envelope distance `l`.
float noiseLobe(vec3 p, float a, float x, float y) {
  return abs(dot(sin(p / a * x), p - p + a * y));
}

// tanh is a GLSL ES 3.00 builtin; WebGL1 is on GLSL ES 1.00 where it does
// not exist, so we provide a numerically stable polyfill. Shadertoy runs
// under WebGL2 which is why the reference gets away with calling it.
vec3 tanhCompat(vec3 x) {
  vec3 e = exp(-2.0 * x);
  return (1.0 - e) / (1.0 + e);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 resolution = resolveResolution();
  float T = resolveTime();

  // When breathing is off we freeze the rising motion at a comfortable
  // mid-phase so the composition still reads but stops moving.
  float breathe = clamp(u_enableBreathe, 0.0, 1.0);
  float timeY = mix(3.14159, T, breathe);

  vec2 R = resolution;
  vec3 o = vec3(0.0);

  // Running accumulator of opacity across outer samples (persists like the
  // single float declaration in the original for-init).
  float k = 0.0;

  // Ray direction is per-fragment constant — hoist it out of the march so
  // we pay `normalize` once instead of 50 times per pixel.
  vec3 rayDir = normalize(vec3(fragCoord + fragCoord, R.y) - vec3(R, 0.0));

  // Warm palette used for both V integration steps — shared constant.
  const vec3 WARM = vec3(3.0, 1.0, 0.7);

  // Background-grade sampling: 50 samples @ step 0.1 still march the full
  // p.z = -3 → +2 volume that the original 100 × 0.05 covered, but cut
  // fragment work roughly in half.
  const float RAY_STEP = 0.1;
  for (int iterOuter = 1; iterOuter <= 50; iterOuter += 1) {
    float i = float(iterOuter);

    vec3 p = rayDir * i * RAY_STEP;
    p.z -= 3.0;

    vec3 q = p - vec3(1.5, 0.7, 0.0);
    float s = length(q);

    // Corner / far-from-column pixels have contributions gated by both
    // `exp(-s*1.3)` and `1/s`; past s ≈ 7 the numerator is swamped by 1e4,
    // so subsequent work is pure heat. This early-out is the single biggest
    // win for fragments outside the ember's reach.
    if (s > 7.0) { break; }

    // Pre-compute the shared distance falloff used by both V steps.
    float expNegS = exp(-s * 1.3);

    q.y = p.y - min(p.y, 0.7);
    float l = length(q);

    p.y += timeY;
    float d = min(length(p.xz), 1.0 - p.z);

    // Domain-warped distance refinement. Starting `a` at 0.04 skips the two
    // finest octaves (a = 0.01, 0.02) — their magnitude of 0.002–0.004 is
    // invisible on a background-blur backdrop. 7 iterations cover
    // a = 0.04 → 2.56 before the `a >= 3` break trips.
    float a = 0.04;
    for (int iterInner = 0; iterInner < 7; iterInner += 1) {
      if (a >= 3.0) { break; }
      p.zy = p.zy * (0.1 * mat2(8.0, 6.0, -6.0, 8.0));
      d -= noiseLobe(p, a, 4.0, 0.2);
      l -= noiseLobe(p, a, 5.0, 0.01);
      a += a;
    }

    // Blend factor between the cool outer smoke and the warm ember core.
    float x = max(2.0 - l, 0.0) * 0.8;

    // --- V step 1: integrate against the column-surface distance `d`,
    //     tinting by the cool→warm palette.
    d = min(d, 0.0);
    float step1 = d * k - d;
    k += step1;
    o += step1 * expNegS * (1.0 + d) * mix(vec3(0.0, 1.5, 3.0), WARM, x);

    // --- V step 2: integrate against the soft envelope distance `l`,
    //     boosted by the warm ember palette to form the bright core.
    d = l;
    d = min(d, 0.0);
    float step2 = d * k - d;
    k += step2;
    o += step2 * expNegS * (1.0 + d) * WARM * 20.0;

    // --- Final per-sample contribution along the ray.
    o += x * (1.0 - k) / (s * 4e2);
  }

  // Tone map like the reference, then re-balance between cool smoke and the
  // warm ember core according to the colour-warmth slider.
  vec3 col = tanhCompat(o);
  float warm = clamp(u_colorWarmth, 0.0, 1.0);
  vec3 cool = col.zyx * vec3(0.55, 0.70, 0.95);
  col = mix(cool, col, warm);

  // Exposure / glow strength. Clamp range is generous — the workspace card
  // sits on top with its own glass dimming, so bright shader output still
  // lands comfortably under the text.
  float glow = clamp(u_glowStrength, 0.3, 2.5);
  col *= glow;

  // Gentle outer vignette so the rail / settings chrome never lose contrast.
  vec2 uv = fragCoord / resolution;
  vec2 v = uv - 0.5;
  col *= 1.0 - dot(v, v) * 0.45;

  fragColor = vec4(col, 1.0);
}
