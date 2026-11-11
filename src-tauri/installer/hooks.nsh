; Installer hooks (tauri.conf.json -> bundle.windows.nsis.installerHooks).
;
; Up to 0.1.18 the program file was saved-board.exe; now it is kipple.exe. Tauri's template
; deletes the old file and repoints Start menu and desktop shortcuts, but it looks only for a
; running kipple.exe and doesn't know the taskbar pin. It also does that only when the old
; install recorded its program name, so the hooks below repoint every known shortcut and delete
; saved-board.exe themselves.

; A shortcut that still opens saved-board.exe opens kipple.exe instead.
!macro KIPPLE_REPOINT LNK
  ${If} ${FileExists} "${LNK}"
    !insertmacro IsShortcutTarget "${LNK}" "$INSTDIR\saved-board.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro SetShortcutTarget "${LNK}" "$INSTDIR\${MAINBINARYNAME}.exe"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; An open 0.1.18 is closed (silent) or asked about, like a running current version: two copies
  ; writing the same library would lose edits.
  !insertmacro CheckIfAppIsRunning "$INSTDIR\saved-board.exe" "${PRODUCTNAME}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Taskbar pin, desktop and Start menu shortcuts of the old program would point at a deleted file.
  !insertmacro KIPPLE_REPOINT "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${PRODUCTNAME}.lnk"
  !insertmacro KIPPLE_REPOINT "$DESKTOP\${PRODUCTNAME}.lnk"
  !insertmacro KIPPLE_REPOINT "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !insertmacro KIPPLE_REPOINT "$SMPROGRAMS\${PRODUCTNAME}\${PRODUCTNAME}.lnk"
  ; The app also removes it on first launch; this covers an install that is never started.
  Delete "$INSTDIR\saved-board.exe"
!macroend
