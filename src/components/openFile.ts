import { platform } from "@platform";
import { T } from "../i18n";

export const NOTICE_EVENT = "kipple-notice";

/** Opens a card's file in its app; a path outside the export folder (or a failure) is reported, not swallowed.
 *  A file that would run as a program is shown in its folder, with a note why. */
export function openCardFile(sourceDir: string, rel: string) {
  const notice = (msg: string) => window.dispatchEvent(new CustomEvent(NOTICE_EVENT, { detail: msg }));
  platform.openFile(sourceDir, rel).then(
    (r) => r === "revealed" && notice(T.detail.fileRunnable),
    (e) => notice(/PATH_OUTSIDE_EXPORT/.test(String(e)) ? T.detail.fileOutside : String(e)),
  );
}
