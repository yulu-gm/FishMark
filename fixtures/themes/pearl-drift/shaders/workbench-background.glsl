// Pearl Drift workbench backdrop.
// Iridescent deformed sphere raymarched over a pearl canvas in light mode
// and a cooler nocturnal atmosphere in dark mode.
// Ported to WebGL1 / GLSL ES 1.00 for Yulora's theme runtime:
//  - precision lowered to mediump for broader ANGLE support
//  - iResolution / iTime resolve from either Shadertoy-style or Yulora-style uniforms
//  - iridescence / animationSpeed / enableGrain stay user-adjustable
//  - u_themeMode drives the light/dark split directly
//  - map / calcNormal take explicit time input to avoid hidden global state
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 iResolution;
uniform float iTime;

uniform float u_iridescence;
uniform float u_animationSpeed;
uniform float u_enableGrain;
uniform float u_themeMode;

vec2 resolveResolution() {
  return iResolution.x > 0.0 ? iResolution.xy : u_resolution;
}

float resolveTime() {
  return iTime > 0.0 ? iTime : u_time;
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}

float mapSDF(vec3 p, float T) {
  p.xz = rot(p.y + T) * p.xz;
  float displacement = sin(p.x * 2.0 + T)
                     * sin(p.y * 3.0)
                     * sin(p.z * 2.0)
                     * 0.15;
  return length(p) - 1.0 + displacement;
}

vec3 calcNormal(vec3 p, float T) {
  vec2 e = vec2(0.0015, 0.0);
  float dx = mapSDF(p + vec3(e.x, e.y, e.y), T)
           - mapSDF(p - vec3(e.x, e.y, e.y), T);
  float dy = mapSDF(p + vec3(e.y, e.x, e.y), T)
           - mapSDF(p - vec3(e.y, e.x, e.y), T);
  float dz = mapSDF(p + vec3(e.y, e.y, e.x), T)
           - mapSDF(p - vec3(e.y, e.y, e.x), T);
  return normalize(vec3(dx, dy, dz));
}

vec3 cosinePalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 resolution = resolveResolution();
  float rawTime = resolveTime();

  float speed = clamp(u_animationSpeed, 0.0, 1.5);
  float T = mix(2.3, rawTime * speed, step(0.001, speed));

  vec2 uv = (fragCoord - 0.5 * resolution) / resolution.y;
  float tone = clamp(u_themeMode, 0.0, 1.0);
  vec3 bgLight = vec3(0.95, 0.95, 0.97);
  vec3 bgDark = vec3(0.045, 0.05, 0.11);
  vec3 bg = mix(bgLight, bgDark, tone);

  vec3 ro = vec3(0.0, 0.0, -3.0);
  vec3 rd = normalize(vec3(uv, 1.2));

  vec3 pos = ro;
  float edge = 0.0;
  float t = 0.0;
  float bubbleWash = 0.0;

  for (int i = 0; i < 64; i++) {
    pos = ro + rd * t;
    float d = mapSDF(pos, T);
    edge = 1.0 - smoothstep(0.0, 0.01, d);
    if (d < 0.001 || t > 8.0) break;
    t += clamp(d * 0.75, 0.015, 0.2);
  }

  vec3 col = bg;

  if (t < 8.0) {
    vec3 N = calcNormal(pos, T);

    vec3 lightDir = normalize(vec3(-0.15, 0.95, 0.25));
    float fresnel = pow(1.0 - max(dot(N, -rd), 0.0), 3.0);

    vec3 baseColor = mix(vec3(1.0, 1.0, 1.0), vec3(0.72, 0.8, 0.98), tone);
    vec3 iridLight = 0.5 + 0.5 * cos(6.28318
      * (vec3(0.0, 0.33, 0.67) + fresnel + pos.y * 0.5));
    vec3 iridDark = 0.5 + 0.5 * cos(6.28318
      * (vec3(0.08, 0.41, 0.79) + fresnel * 1.15 + pos.y * 0.65 + pos.z * 0.15));
    vec3 irid = mix(iridLight, iridDark, tone);

    float diff = 0.5 + 0.5 * max(dot(N, lightDir), 0.0);
    float spec = pow(max(dot(reflect(rd, N), lightDir), 0.0), 32.0);

    float band1 = sin(pos.y * 4.5 + pos.x * 2.0 - T * 0.7);
    float band2 = sin((pos.y + pos.z) * 6.0 + pos.x * 1.4 + T * 0.5);
    float flow = 0.5 + 0.5 * (0.6 * band1 + 0.4 * band2);
    vec3 pearlTintLight = cosinePalette(
      flow + fresnel * 0.35,
      vec3(0.96),
      vec3(0.05, 0.06, 0.08),
      vec3(1.0),
      vec3(0.15, 0.45, 0.75));
    vec3 pearlTintDark = cosinePalette(
      flow + fresnel * 0.48,
      vec3(0.4, 0.48, 0.62),
      vec3(0.18, 0.2, 0.28),
      vec3(1.0),
      vec3(0.62, 0.22, 0.84));
    vec3 pearlTint = mix(pearlTintLight, pearlTintDark, tone);

    float iri = clamp(u_iridescence, 0.0, 1.5);

    col = mix(baseColor, irid, fresnel * 0.8 * iri);
    col *= mix(vec3(0.97, 0.98, 1.0), pearlTint, 0.35 * iri);
    col *= mix(0.92, 1.08, diff);
    float centerFade = pow(max(dot(N, -rd), 0.0), 2.2);
    bubbleWash = centerFade * tone * 0.38;
    col = mix(col, bg, bubbleWash);
    col = mix(bg, col, edge);
  }

  float vignette = 1.0 - dot(uv, uv) * 0.12;
  col *= vignette;

  if (u_enableGrain > 0.5) {
    float grain = fract(sin(dot(fragCoord + rawTime * 37.0,
                                vec2(12.9898, 78.233))) * 43758.5453);
    col += (grain - 0.5) * 0.01;
  }

  col = clamp(col, 0.0, 1.0);
  col = pow(col, vec3(0.95));

  float alpha = mix(1.0, 0.78, bubbleWash);
  fragColor = vec4(col, alpha);
}
