import { platform } from "@platform";
import { T } from "../i18n";

export const NOTICE_EVENT = "kipple-notice";

/** Opens a card's file in its app; a path outside the export folder (or a failure) is reported, not swallowed. */
export function openCardFile(sourceDir: string, rel: string) {
  platform.openFile(sourceDir, rel).catch((e) => {
    const msg = /PATH_OUTSIDE_EXPORT/.test(String(e)) ? T.detail.fileOutside : String(e);
    window.dispatchEvent(new CustomEvent(NOTICE_EVENT, { detail: msg }));
  });
}
