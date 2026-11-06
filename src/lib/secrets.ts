import { platform } from "@platform";
import type { AiAuth } from "./ai";

// Desktop: the OS credential store (Windows Credential Manager, macOS Keychain), never a file.
const NAME = "anthropic_api_key";
export const getApiKey = () => platform.secrets.get(NAME);
export const setApiKey = (value: string) => platform.secrets.set(NAME, value);
export const deleteApiKey = () => platform.secrets.delete(NAME);

// A random id for this install, so the built-in key's daily allowance is counted per install.
// It says nothing about the person; deleting it only resets the count.
const INSTALL = "kipple_install_id";
let installId: Promise<string> | null = null;
export function getInstallId(): Promise<string> {
  installId ??= (async () => {
    const have = await platform.secrets.get(INSTALL).catch(() => null);
    if (have) return have;
    const id = crypto.randomUUID();
    await platform.secrets.set(INSTALL, id).catch(() => undefined);
    return id;
  })();
  return installId;
}

/** Whose key pays for AI: the user's own if they saved one, otherwise the built-in one. */
export async function getAiAuth(): Promise<AiAuth> {
  const key = await getApiKey().catch(() => null);
  return key ? { kind: "own", key } : { kind: "builtin", install: await getInstallId() };
}
