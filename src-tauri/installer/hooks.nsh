; Installer hooks (tauri.conf.json -> bundle.windows.nsis.installerHooks).
;
; Up to 0.1.18 the program file was saved-board.exe; now it is kipple.exe. Tauri's template
; deletes the old file and repoints Start menu and desktop shortcuts, but it looks only for a
; running kipple.exe and doesn't know the taskbar pin.

!macro NSIS_HOOK_PREINSTALL
  ; An open 0.1.18 is closed (silent) or asked about, like a running current version: two copies
  ; writing the same library would lose edits.
  !insertmacro CheckIfAppIsRunning "$INSTDIR\saved-board.exe" "${PRODUCTNAME}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; A taskbar pin of the old program would point at a deleted file.
  !define KIPPLE_PIN "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${PRODUCTNAME}.lnk"
  ${If} ${FileExists} "${KIPPLE_PIN}"
    !insertmacro IsShortcutTarget "${KIPPLE_PIN}" "$INSTDIR\saved-board.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro SetShortcutTarget "${KIPPLE_PIN}" "$INSTDIR\${MAINBINARYNAME}.exe"
    ${EndIf}
  ${EndIf}
  !undef KIPPLE_PIN
!macroend
