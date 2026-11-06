import { useEffect, useState } from "react";
import { platform } from "@platform";
import type { TelegramAccount } from "./platform/types";

/**
 * The signed-in Telegram account for the sidebar header (desktop only).
 * Re-checks whenever `active` turns true, e.g. after the Telegram dialog closes,
 * since the user may have signed in or out there. Offline, the last known value stays.
 */
export function useTelegramAccount(active: boolean): TelegramAccount | null {
  const [account, setAccount] = useState<TelegramAccount | null>(null);
  useEffect(() => {
    const tg = platform.telegram;
    if (!active || !tg) return;
    let live = true;
    tg.account()
      .then((a) => live && setAccount(a))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [active]);
  return account;
}
