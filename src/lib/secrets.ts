import { platform } from "@platform";

// Desktop: the OS credential store (Windows Credential Manager, macOS Keychain), never a file.
const NAME = "anthropic_api_key";
export const getApiKey = () => platform.secrets.get(NAME);
export const setApiKey = (value: string) => platform.secrets.set(NAME, value);
export const deleteApiKey = () => platform.secrets.delete(NAME);
