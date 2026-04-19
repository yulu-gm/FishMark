import { describe, expect, it } from "vitest";

import { createThemeSceneState } from "./theme-scene-state";

describe("theme scene state", () => {
  it("injects built-in runtime env uniforms and lets built-ins win over shared uniform collisions", () => {
    const lightScene = createThemeSceneState(
      {
        sceneId: "pearl-scene",
        themeMode: "light",
        effectsMode: "full",
        sharedUniforms: {
          iridescence: 1
        },
        runtimeEnv: {
          wordCount: 24,
          focusMode: 0,
          viewport: { width: 800, height: 600 }
        }
      },
      { now: () => 1_000 }
    );
    const darkScene = createThemeSceneState(
      {
        sceneId: "pearl-scene",
        themeMode: "dark",
        effectsMode: "full",
        sharedUniforms: {
          iridescence: 1,
          themeMode: 99,
          wordCount: -1,
          focusMode: 0,
          viewportWidth: 1,
          viewportHeight: 1
        },
        runtimeEnv: {
          wordCount: 512,
          focusMode: 1,
          viewport: { width: 1_440, height: 900 }
        }
      },
      { now: () => 1_000 }
    );

    expect(lightScene.nextFrame("workbenchBackground", { width: 800, height: 600 }).uniforms).toMatchObject({
      iridescence: 1,
      wordCount: 24,
      focusMode: 0,
      themeMode: 0,
      viewportWidth: 800,
      viewportHeight: 600
    });
    expect(darkScene.nextFrame("workbenchBackground", { width: 1_440, height: 900 }).uniforms).toMatchObject({
      iridescence: 1,
      wordCount: 512,
      focusMode: 1,
      themeMode: 1,
      viewportWidth: 1_440,
      viewportHeight: 900
    });
  });

  it("shares a clock snapshot across surfaces rendered in the same turn", () => {
    let nowMs = 1_000;
    const scene = createThemeSceneState(
      {
        sceneId: "rain-scene",
        themeMode: "dark",
        effectsMode: "full",
        sharedUniforms: { rainAmount: 0.7 },
        runtimeEnv: {
          wordCount: 32,
          focusMode: 1,
          viewport: { width: 1_200, height: 800 }
        }
      },
      { now: () => nowMs }
    );

    const workbenchFrame = scene.nextFrame("workbenchBackground", { width: 1_200, height: 800 });
    nowMs = 1_650;
    const titlebarFrame = scene.nextFrame("titlebarBackdrop", { width: 1_200, height: 44 });

    expect(workbenchFrame.time).toBe(0);
    expect(titlebarFrame.time).toBe(0);
    expect(titlebarFrame.uniforms.rainAmount).toBe(0.7);

    workbenchFrame.uniforms.rainAmount = 0.1;

    expect(scene.nextFrame("welcomeHero", { width: 640, height: 360 }).uniforms.rainAmount).toBe(0.7);
  });

  it("advances time on the next turn", async () => {
    let nowMs = 2_500;
    const scene = createThemeSceneState(
      {
        sceneId: "mist-scene",
        themeMode: "light",
        effectsMode: "auto",
        sharedUniforms: {},
        runtimeEnv: {
          wordCount: 0,
          focusMode: 0,
          viewport: { width: 800, height: 600 }
        }
      },
      { now: () => nowMs }
    );

    const initialFrame = scene.nextFrame("workbenchBackground", { width: 800, height: 600 });
    await Promise.resolve();
    nowMs = 4_000;
    const nextFrame = scene.nextFrame("workbenchBackground", { width: 800, height: 600 });

    expect(initialFrame.time).toBe(0);
    expect(nextFrame.time).toBeCloseTo(1.5, 5);
  });

  it("updates runtime env uniforms without recreating shared uniforms", () => {
    const scene = createThemeSceneState(
      {
        sceneId: "rain-scene",
        themeMode: "dark",
        effectsMode: "full",
        sharedUniforms: { rainAmount: 0.7 },
        runtimeEnv: {
          wordCount: 12,
          focusMode: 0,
          viewport: { width: 1_024, height: 768 }
        }
      },
      { now: () => 1_000 }
    );

    scene.updateRuntimeEnv({
      wordCount: 128,
      focusMode: 1,
      viewport: { width: 1_280, height: 720 }
    });

    expect(scene.nextFrame("workbenchBackground", { width: 1_280, height: 720 }).uniforms).toMatchObject({
      rainAmount: 0.7,
      wordCount: 128,
      focusMode: 1,
      themeMode: 1,
      viewportWidth: 1_280,
      viewportHeight: 720
    });
  });
});
