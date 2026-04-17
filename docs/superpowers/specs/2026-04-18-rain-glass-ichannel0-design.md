# Rain Glass `iChannel0` Support Design

## Context

The current shader theme runtime can render animated fragment shaders for `workbenchBackground` and `titlebarBackdrop`, but it does not provide any input textures.

That limitation is the main reason the bundled `Rain Glass` theme still feels less realistic than the reference Shadertoy rain shader:

- the runtime can animate rain drops and trails
- but the shader cannot refract a real background plate
- so the effect is forced into procedural gradients instead of wet-glass distortion

The first step toward Shadertoy-style realism is a minimal `iChannel0` capability backed by a static image supplied by the theme package.

## Goal

Add a minimal texture-channel path so a theme package can declare an image resource for `workbenchBackground`, and the renderer runtime exposes that image to the shader as `iChannel0`.

This enables `Rain Glass` to refract and blur a realistic outdoor scene plate instead of a generated gradient.

## Non-Goals

- No multi-pass compositor
- No `iChannel1..3`
- No buffer feedback or Shadertoy buffer passes
- No scene capture of the live app UI
- No new user-facing surface types
- No full titlebar parity with the workbench effect in the first iteration

## User Outcome

After this change:

- `Rain Glass` workbench background should look materially closer to the reference wet-glass shader
- rain drops and trails distort a believable window-outside image
- the titlebar remains visually aligned with the workbench, but can stay on a lighter-weight shader path

## Approach

Use a minimal Shadertoy-compatible subset:

- theme package manifest may declare `channels.0`
- the runtime loads the declared image as a WebGL texture
- the fragment shader receives:
  - `uniform vec3 iResolution`
  - `uniform float iTime`
  - `uniform sampler2D iChannel0`
- Yulora-specific shared uniforms such as `u_rainAmount` and `u_glassBlur` remain supported

This is intentionally a hybrid model:

- Shadertoy-style names are supported where they reduce porting effort
- Yulora-specific theme controls remain available through explicit `u_*` uniforms

## Theme Package Contract

### Manifest shape

`ThemeSurfaceDescriptor` grows a `channels` field:

```ts
type ThemeSurfaceChannelDescriptor = {
  type: "image";
  src: string;
};

type ThemeSurfaceDescriptor = {
  kind: "fragment";
  scene: string;
  shader: string;
  channels?: Partial<Record<"0", ThemeSurfaceChannelDescriptor>>;
};
```

### First-iteration constraints

- Only channel key `"0"` is supported
- Only `type: "image"` is supported
- `src` must resolve to a file inside the theme package root
- channels remain optional
- surfaces without channels keep working exactly as they do now

## Renderer Runtime

### Shader source compatibility

`buildFragmentShaderSource` should support these runtime-provided uniforms:

- `iResolution`
- `iTime`
- `iChannel0` when channel 0 exists
- existing `u_*` shared uniforms

The runtime should still avoid duplicate declarations when the shader source already declares them.

### Texture loading

For `channels.0`:

1. Resolve the declared asset path through the existing preview asset URL flow
2. Load the image in the renderer
3. Create and bind a WebGL texture before rendering
4. Bind it to texture unit 0
5. Set `iChannel0` to sampler unit `0`

### Failure behavior

If any of these fail:

- channel asset fetch fails
- image decoding fails
- texture creation fails
- shader compile/link fails

the surface must fall back cleanly to the existing static theme styling path.

The failure mode remains:

- editor stays usable
- shader surface becomes non-blocking fallback
- no destructive crash path

## Rain Glass Theme Changes

### New asset

Add a static outdoor background plate:

- path: `fixtures/themes/rain-glass/assets/textures/rain-window-scene.png`
- style: overcast exterior scene with soft trees and distant building silhouettes
- palette: cool blue-gray
- composition: detailed enough to distort well, but not dominated by a single focal subject

### Manifest

`fixtures/themes/rain-glass/manifest.json` should declare:

```json
{
  "surfaces": {
    "workbenchBackground": {
      "kind": "fragment",
      "scene": "rain-scene",
      "shader": "./shaders/workbench-background.glsl",
      "channels": {
        "0": {
          "type": "image",
          "src": "./assets/textures/rain-window-scene.png"
        }
      }
    }
  }
}
```

### Workbench shader

The new `Rain Glass` workbench shader should adapt the reference Shadertoy design by keeping the rain mechanics that matter most:

- static droplets
- larger moving drops
- trail carving
- normals derived from rain coverage
- blurred/refraction sampling through `iChannel0`
- restrained fog and post-process tinting

The shader should intentionally drop these reference-specific branches:

- `HAS_HEART`
- mouse-driven interaction
- narrative timing logic tied to the heart reveal

### Titlebar shader

First iteration keeps titlebar simpler:

- same visual family
- lighter fog/water language
- no requirement to implement the same full `iChannel0` distortion path immediately

This keeps implementation complexity concentrated in the workbench where realism matters most.

## Files Expected To Change

### Shared contract

- `src/shared/theme-package.ts`
- related shared tests

### Renderer runtime

- `src/renderer/shader/theme-surface-runtime.ts`
- renderer runtime tests

### Sample theme

- `fixtures/themes/rain-glass/manifest.json`
- `fixtures/themes/rain-glass/shaders/workbench-background.glsl`
- `fixtures/themes/rain-glass/assets/textures/rain-window-scene.png`
- optional titlebar shader touch-up if needed for consistency

## Testing

### Contract tests

- manifest normalization accepts `channels.0`
- non-image channel declarations are rejected
- out-of-package asset paths are rejected

### Runtime tests

- shader runtime injects `iChannel0` only when declared
- runtime binds a texture for channel 0
- surfaces without channels still render
- texture load failure falls back safely

### App integration tests

- `Rain Glass` package resolves with a preview asset URL for `channels.0`
- workbench shader host still mounts correctly
- existing fallback behavior remains intact

## Acceptance Criteria

This task is complete when:

1. Theme packages can declare `channels.0` image input for a fragment surface
2. The renderer runtime exposes that image as `iChannel0`
3. `Rain Glass` workbench background uses the image plate for wet-glass refraction
4. The effect is visibly closer to the reference Shadertoy realism than the current procedural-only version
5. Failure cases fall back to static styling without breaking editor usability
6. Relevant tests and typecheck pass

## Risks

### Performance risk

Texture uploads and extra sampling increase fragment cost.

Mitigation:

- keep first iteration to one channel
- use a single static image
- keep the feature scoped to `workbenchBackground`

### Visual mismatch risk

A poor input plate will still look artificial even if the technical pipeline is correct.

Mitigation:

- generate a scene plate specifically for refraction use
- favor soft layered detail over high-contrast subjects

### Scope risk

It is tempting to also add scene capture, multiple channels, or titlebar parity immediately.

Mitigation:

- explicitly ship only the minimal `iChannel0` image path first
- defer live scene capture and multi-pass support to a later design
