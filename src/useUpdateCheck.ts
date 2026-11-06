import { useCallback, useEffect, useRef, useState } from "react";
import { platform } from "@platform";
import type { AvailableUpdate } from "./platform/types";

/** How often a running app looks for a new release. */
const CHECK_EVERY_MS = 30 * 60 * 1000;
/** Coming back to the window checks again, but not more often than this. */
const MIN_GAP_MS = 5 * 60 * 1000;
/** "Later" hides a version for this long; a newer version shows up right away. */
const SNOOZE_MS = 4 * 60 * 60 * 1000;

/**
 * Desktop only (the web build's checkUpdate always returns null): checks for a new release
 * on start, every 30 minutes, and when the window gets focus again, so an app that stays open
 * for days still offers the update.
 */
export function useUpdateCheck(busy: () => boolean) {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const lastCheck = useRef(0);
  const snoozed = useRef<{ version: string; until: number } | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const run = useCallback(async (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastCheck.current < MIN_GAP_MS) return;
    // Never swap the update object while it is downloading.
    if (busyRef.current()) return;
    lastCheck.current = now;
    try {
      const found = await platform.checkUpdate();
      if (busyRef.current()) return;
      const s = snoozed.current;
      if (found && s && s.version === found.version && Date.now() < s.until) return;
      setUpdate(found);
    } catch (e) {
      console.warn("update check failed", e);
    }
  }, []);

  useEffect(() => {
    void run(true);
    const timer = setInterval(() => void run(true), CHECK_EVERY_MS);
    const onFocus = () => void run(false);
    const onVisible = () => document.visibilityState === "visible" && void run(false);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [run]);

  const later = useCallback(() => {
    setUpdate((u) => {
      if (u) snoozed.current = { version: u.version, until: Date.now() + SNOOZE_MS };
      return null;
    });
  }, []);

  return { update, later };
}
