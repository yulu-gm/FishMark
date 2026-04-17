precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_rainAmount;
uniform float u_glassBlur;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution;
  float shimmer = sin((uv.x * 20.0) + u_time * 1.9) * 0.01 * u_rainAmount;
  float mist = 0.12 + (0.1 * u_glassBlur);
  vec3 color = mix(vec3(0.08, 0.14, 0.22), vec3(0.24, 0.4, 0.54), uv.y);
  color += shimmer;
  color += mist * 0.4;
  fragColor = vec4(color, 0.5);
}
