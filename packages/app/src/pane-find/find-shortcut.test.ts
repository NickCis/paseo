import { describe, expect, it } from "vitest";
import {
  isFindShortcut,
  isTerminalFindShortcut,
  resolveTerminalFindShortcut,
} from "./find-shortcut";

const MAC = { isMac: true };
const NON_MAC = { isMac: false };

function keydown(
  overrides: Partial<Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">>,
) {
  return {
    key: "f",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

describe("on macOS", () => {
  it("opens Find with Command+F", () => {
    expect(isFindShortcut(keydown({ metaKey: true }), MAC)).toBe(true);
  });

  it("leaves Control+F to text editing", () => {
    expect(isFindShortcut(keydown({ ctrlKey: true }), MAC)).toBe(false);
  });

  it("ignores Control+Command+F", () => {
    expect(isFindShortcut(keydown({ metaKey: true, ctrlKey: true }), MAC)).toBe(false);
  });

  it("ignores Shift and Alt variants", () => {
    expect(isFindShortcut(keydown({ metaKey: true, shiftKey: true }), MAC)).toBe(false);
    expect(isFindShortcut(keydown({ metaKey: true, altKey: true }), MAC)).toBe(false);
  });
});

describe("off macOS", () => {
  it("opens Find with Control+F", () => {
    expect(isFindShortcut(keydown({ ctrlKey: true }), NON_MAC)).toBe(true);
  });

  it("ignores Meta+F", () => {
    expect(isFindShortcut(keydown({ metaKey: true }), NON_MAC)).toBe(false);
  });

  it("ignores Control+Meta+F", () => {
    expect(isFindShortcut(keydown({ ctrlKey: true, metaKey: true }), NON_MAC)).toBe(false);
  });

  it("ignores Shift and Alt variants", () => {
    expect(isFindShortcut(keydown({ ctrlKey: true, shiftKey: true }), NON_MAC)).toBe(false);
    expect(isFindShortcut(keydown({ ctrlKey: true, altKey: true }), NON_MAC)).toBe(false);
  });
});

it("matches an uppercase F from a shifted keyboard layout", () => {
  expect(isFindShortcut(keydown({ key: "F", metaKey: true }), MAC)).toBe(true);
  expect(isFindShortcut(keydown({ key: "F", ctrlKey: true }), NON_MAC)).toBe(true);
});

it("ignores other keys", () => {
  expect(isFindShortcut(keydown({ key: "g", metaKey: true }), MAC)).toBe(false);
  expect(isFindShortcut(keydown({ key: "g", ctrlKey: true }), NON_MAC)).toBe(false);
});

describe("terminal Find", () => {
  it("keeps Command+F on macOS", () => {
    expect(isTerminalFindShortcut(keydown({ metaKey: true }), MAC)).toBe(true);
    expect(isTerminalFindShortcut(keydown({ ctrlKey: true }), MAC)).toBe(false);
  });

  it("leaves Control+F to the shell off macOS", () => {
    expect(isTerminalFindShortcut(keydown({ ctrlKey: true }), NON_MAC)).toBe(false);
  });

  it("opens Find with Control+Shift+F off macOS", () => {
    expect(isTerminalFindShortcut(keydown({ ctrlKey: true, shiftKey: true }), NON_MAC)).toBe(true);
    expect(
      isTerminalFindShortcut(keydown({ key: "F", ctrlKey: true, shiftKey: true }), NON_MAC),
    ).toBe(true);
  });

  it("ignores Control+Shift+F with Alt or Meta", () => {
    expect(
      isTerminalFindShortcut(keydown({ ctrlKey: true, shiftKey: true, altKey: true }), NON_MAC),
    ).toBe(false);
    expect(
      isTerminalFindShortcut(keydown({ ctrlKey: true, shiftKey: true, metaKey: true }), NON_MAC),
    ).toBe(false);
  });

  it("with overrides on, uses Control+F off macOS", () => {
    expect(resolveTerminalFindShortcut(keydown({ ctrlKey: true }), NON_MAC, true)).toBe(true);
    expect(
      resolveTerminalFindShortcut(keydown({ ctrlKey: true, shiftKey: true }), NON_MAC, true),
    ).toBe(false);
  });

  it("with overrides off, uses Control+Shift+F off macOS", () => {
    expect(resolveTerminalFindShortcut(keydown({ ctrlKey: true }), NON_MAC, false)).toBe(false);
    expect(
      resolveTerminalFindShortcut(keydown({ ctrlKey: true, shiftKey: true }), NON_MAC, false),
    ).toBe(true);
  });
});
