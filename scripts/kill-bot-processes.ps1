# Stops local VK bot processes:
# - command line contains vk-bot, or
# - bare "node ... index.js" (yarn dev from vk-bot folder — cwd not visible in WMI).
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object {
    $cl = $_.CommandLine
    if ([string]::IsNullOrWhiteSpace($cl)) { return $false }
    if ($cl -match 'vk-bot') { return $true }
    if ($cl -match 'index\.js' -and $cl -notmatch 'nuxt|nuxi|typescript|tsserver|yarn\.js|vite|eslint') { return $true }
    return $false
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped PID $($_.ProcessId)"
  }
