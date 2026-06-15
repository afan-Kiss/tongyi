$ErrorActionPreference = 'Stop'
$dir = Join-Path $PSScriptRoot '..\deploy\frpc' | Resolve-Path -ErrorAction SilentlyContinue
if (-not $dir) {
  $dir = Join-Path (Split-Path $PSScriptRoot -Parent) 'deploy\frpc'
}
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$zip = Join-Path $env:TEMP 'frp_0.69.1_windows_amd64.zip'
$extract = Join-Path $env:TEMP 'frp_extract_0691'
$url = 'https://github.com/fatedier/frp/releases/download/v0.69.1/frp_0.69.1_windows_amd64.zip'

Write-Host "Downloading frp v0.69.1 ..."
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $extract -Force

$src = Join-Path $extract 'frp_0.69.1_windows_amd64\frpc.exe'
$dst = Join-Path $dir 'frpc.exe'
Copy-Item -Force $src $dst

Remove-Item $zip -Force
Remove-Item $extract -Recurse -Force

$item = Get-Item $dst
Write-Host "Installed: $($item.FullName) ($([math]::Round($item.Length/1MB, 2)) MB)"
