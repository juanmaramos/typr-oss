; Registry hooks for Typr NSIS installer
; Replicates the WiX registry entries under HKCU\Software\Typr\Typr

!macro CUSTOM_INSTALL
  ; Write registry entries for app detection
  WriteRegStr HKCU "Software\Typr\Typr" "Version" "${VERSION}"
  WriteRegStr HKCU "Software\Typr\Typr" "InstallPath" "$INSTDIR"
!macroend

!macro CUSTOM_UNINSTALL
  ; Remove registry entries on uninstall
  DeleteRegKey HKCU "Software\Typr\Typr"
!macroend
