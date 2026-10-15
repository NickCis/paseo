export interface FindShortcutPlatform {
  isMac: boolean;
}

/**
 * The Find keystroke policy for text surfaces: Command+F on macOS, Control+F everywhere else.
 * The terminal may use a different key off macOS; see `resolveTerminalFindShortcut`.
 *
 * Control+F is a macOS text-editing binding that moves the caret forward, so a
 * surface that also claims it there eats a keystroke the text editor owns.
 *
 * The platform is a parameter rather than a lookup because this module is
 * imported by the terminal emulator runtime, which is bundled on its own into
 * the terminal WebView and cannot load React Native. App surfaces pass
 * `findShortcutPlatform()` from `@/pane-find`.
 */
export function isFindShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  platform: FindShortcutPlatform,
): boolean {
  const primaryModifier = platform.isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  return primaryModifier && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "f";
}

/**
 * Terminal Find when control-sequence overrides are off. Ctrl+F belongs to the shell
 * (readline forward-char), so off macOS the terminal claims Ctrl+Shift+F instead.
 * macOS keeps Cmd+F.
 */
export function isTerminalFindShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  platform: FindShortcutPlatform,
): boolean {
  if (platform.isMac) {
    return isFindShortcut(event, platform);
  }
  return (
    event.ctrlKey &&
    event.shiftKey &&
    !event.metaKey &&
    !event.altKey &&
    event.key.toLowerCase() === "f"
  );
}

/**
 * Terminal Find keystroke for the current override preference.
 * When overrides are on (default), Ctrl+F opens Find off macOS — the historical behavior.
 * When off, Ctrl+F goes to the shell and Find uses Ctrl+Shift+F.
 */
export function resolveTerminalFindShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  platform: FindShortcutPlatform,
  overrideControlSequences: boolean,
): boolean {
  return overrideControlSequences
    ? isFindShortcut(event, platform)
    : isTerminalFindShortcut(event, platform);
}
