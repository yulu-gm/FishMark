import { describe, expect, it, vi } from "vitest";

import { createWorkspaceWindowRegistrationApplication } from "./workspace-window-registration-application";

type TestSender = {
  destroyed: boolean;
};

type TestWindow = {
  id: string;
  destroyed: boolean;
  sender: TestSender;
};

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((done) => {
      resolve = done;
    }),
    resolve
  };
}

function createFixture() {
  const trace: string[] = [];
  const sender: TestSender = { destroyed: false };
  const owner: TestWindow = {
    id: "window-1",
    destroyed: false,
    sender
  };
  let resolvedOwner: TestWindow | null = owner;
  const ready = deferred();
  const registerWindow = vi.fn((windowId: string) => {
    trace.push(`register:${windowId}`);
  });
  const bindWindow = vi.fn((window: TestWindow, windowId: string) => {
    trace.push(`bind:${window.id}:${windowId}`);
  });
  const focusWindow = vi.fn((windowId: string) => {
    trace.push(`focus:${windowId}`);
  });
  const application = createWorkspaceWindowRegistrationApplication<
    TestSender,
    TestWindow
  >({
    isSenderDestroyed: (candidate) => {
      trace.push("sender-live");
      return candidate.destroyed;
    },
    resolveOwnerWindow: () => {
      trace.push("resolve-owner");
      return resolvedOwner;
    },
    isOwnerWindowDestroyed: (window) => {
      trace.push("owner-live");
      return window.destroyed;
    },
    isOwnerWindowForSender: (window, candidate) => {
      trace.push("owner-identity");
      return window.sender === candidate;
    },
    getWindowId: (window) => {
      trace.push("window-id");
      return window.id;
    },
    markWindowReady: (windowId) => {
      trace.push(`ready:${windowId}`);
      return ready.promise;
    },
    registerWindow,
    bindWindow,
    focusWindow
  });

  return {
    application,
    bindWindow,
    focusWindow,
    owner,
    ready,
    registerWindow,
    sender,
    setResolvedOwner: (window: TestWindow | null) => {
      resolvedOwner = window;
    },
    trace
  };
}

function expectNoRegistration(fixture: ReturnType<typeof createFixture>): void {
  expect(fixture.registerWindow).not.toHaveBeenCalled();
  expect(fixture.bindWindow).not.toHaveBeenCalled();
  expect(fixture.focusWindow).not.toHaveBeenCalled();
}

describe("createWorkspaceWindowRegistrationApplication", () => {
  it("revalidates the same live owner after readiness before registering, binding, and focusing", async () => {
    const fixture = createFixture();

    const registration = fixture.application.ensureWindow(fixture.sender);
    expect(fixture.trace).toEqual([
      "sender-live",
      "resolve-owner",
      "owner-live",
      "owner-identity",
      "window-id",
      "ready:window-1"
    ]);

    fixture.ready.resolve();

    await expect(registration).resolves.toBe("window-1");
    expect(fixture.trace).toEqual([
      "sender-live",
      "resolve-owner",
      "owner-live",
      "owner-identity",
      "window-id",
      "ready:window-1",
      "sender-live",
      "resolve-owner",
      "window-id",
      "owner-live",
      "owner-identity",
      "register:window-1",
      "bind:window-1:window-1",
      "focus:window-1"
    ]);
    expect(fixture.registerWindow).toHaveBeenCalledOnce();
    expect(fixture.bindWindow).toHaveBeenCalledOnce();
    expect(fixture.focusWindow).toHaveBeenCalledOnce();
  });

  it("rejects a destroyed sender before readiness without side effects", async () => {
    const fixture = createFixture();
    fixture.sender.destroyed = true;

    await expect(
      fixture.application.ensureWindow(fixture.sender)
    ).rejects.toThrow("Workspace renderer is no longer available.");
    expect(fixture.trace).toEqual(["sender-live"]);
    expectNoRegistration(fixture);
  });

  it("rejects a missing owner before readiness without side effects", async () => {
    const fixture = createFixture();
    fixture.setResolvedOwner(null);

    await expect(
      fixture.application.ensureWindow(fixture.sender)
    ).rejects.toThrow("Workspace renderer does not belong to a live window.");
    expectNoRegistration(fixture);
  });

  it("rejects a destroyed owner before readiness without side effects", async () => {
    const fixture = createFixture();
    fixture.owner.destroyed = true;

    await expect(
      fixture.application.ensureWindow(fixture.sender)
    ).rejects.toThrow("Workspace renderer does not belong to a live window.");
    expectNoRegistration(fixture);
  });

  it("rejects a sender whose resolved window does not own it", async () => {
    const fixture = createFixture();
    fixture.owner.sender = { destroyed: false };

    await expect(
      fixture.application.ensureWindow(fixture.sender)
    ).rejects.toThrow("Workspace renderer does not belong to a live window.");
    expectNoRegistration(fixture);
  });

  it("rejects when readiness fails without registering the window", async () => {
    const failure = new Error("ready failed");
    const registerWindow = vi.fn();
    const bindWindow = vi.fn();
    const focusWindow = vi.fn();
    const sender = { destroyed: false };
    const owner = { id: "window-1", destroyed: false, sender };
    const application = createWorkspaceWindowRegistrationApplication<
      TestSender,
      TestWindow
    >({
      isSenderDestroyed: (candidate) => candidate.destroyed,
      resolveOwnerWindow: () => owner,
      isOwnerWindowDestroyed: (window) => window.destroyed,
      isOwnerWindowForSender: (window, candidate) => window.sender === candidate,
      getWindowId: (window) => window.id,
      markWindowReady: async () => {
        throw failure;
      },
      registerWindow,
      bindWindow,
      focusWindow
    });

    await expect(application.ensureWindow(sender)).rejects.toBe(failure);
    expect(registerWindow).not.toHaveBeenCalled();
    expect(bindWindow).not.toHaveBeenCalled();
    expect(focusWindow).not.toHaveBeenCalled();
  });

  it("rejects a sender destroyed while readiness is pending", async () => {
    const fixture = createFixture();
    const registration = fixture.application.ensureWindow(fixture.sender);

    fixture.sender.destroyed = true;
    fixture.ready.resolve();

    await expect(registration).rejects.toThrow(
      "Workspace renderer is no longer available."
    );
    expectNoRegistration(fixture);
  });

  it("rejects an owner destroyed while readiness is pending", async () => {
    const fixture = createFixture();
    const registration = fixture.application.ensureWindow(fixture.sender);

    fixture.owner.destroyed = true;
    fixture.ready.resolve();

    await expect(registration).rejects.toThrow(
      "Workspace renderer does not belong to a live window."
    );
    expectNoRegistration(fixture);
  });

  it("rejects when the owner disappears while readiness is pending", async () => {
    const fixture = createFixture();
    const registration = fixture.application.ensureWindow(fixture.sender);

    fixture.setResolvedOwner(null);
    fixture.ready.resolve();

    await expect(registration).rejects.toThrow(
      "Workspace renderer owner changed while becoming ready."
    );
    expectNoRegistration(fixture);
  });

  it("rejects a different owner object even when its id is unchanged", async () => {
    const fixture = createFixture();
    const registration = fixture.application.ensureWindow(fixture.sender);

    fixture.setResolvedOwner({
      id: "window-1",
      destroyed: false,
      sender: fixture.sender
    });
    fixture.ready.resolve();

    await expect(registration).rejects.toThrow(
      "Workspace renderer owner changed while becoming ready."
    );
    expectNoRegistration(fixture);
  });

  it("rejects when the captured owner's id changes while readiness is pending", async () => {
    const fixture = createFixture();
    const registration = fixture.application.ensureWindow(fixture.sender);

    fixture.owner.id = "window-2";
    fixture.ready.resolve();

    await expect(registration).rejects.toThrow(
      "Workspace renderer owner changed while becoming ready."
    );
    expectNoRegistration(fixture);
  });
});
