$desktop = [Environment]::GetFolderPath('Desktop')
$wshell = New-Object -ComObject WScript.Shell
$shortcut = $wshell.CreateShortcut("$desktop\AI-Market.lnk")
$shortcut.TargetPath = "E:\ai_market\Run-AI-Market.bat"
$shortcut.WorkingDirectory = "E:\ai_market"
$shortcut.Save()
Write-Host "Shortcut created at: $desktop"
