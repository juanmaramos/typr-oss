# Enable Windows Long Path Support (requires admin)
# This fixes the 260 character path limit

Write-Host "Enabling Windows Long Path Support..." -ForegroundColor Yellow

# Enable in registry
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
    -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force | Out-Null

Write-Host "✓ Long paths enabled in registry" -ForegroundColor Green

# Also enable for Git
git config --system core.longpaths true

Write-Host "✓ Long paths enabled for Git" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: You may need to restart your computer for this to take full effect." -ForegroundColor Cyan
Write-Host "After restart, run the build script again." -ForegroundColor Cyan


