precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_rainAmount;
uniform float u_glassBlur;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution;
  float wave = sin((uv.x * 11.0) + (uv.y * 17.0) + u_time * 1.5) * 0.018 * u_rainAmount;
  float glow = 0.16 + (0.08 * u_glassBlur) + (0.03 * sin(u_time * 0.7 + uv.y * 6.0));
  vec3 top = vec3(0.58, 0.79, 0.92);
  vec3 bottom = vec3(0.12, 0.22, 0.36);
  vec3 color = mix(bottom, top, smoothstep(0.0, 1.0, uv.y));
  color += wave;
  color += glow * 0.5;
  fragColor = vec4(color, 0.34 + (0.12 * u_glassBlur));
}
