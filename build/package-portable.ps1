<#
.SYNOPSIS
    Builds the NekoScape web renderer and publishes the Win32 desktop host into build/release/NekoScape/.
#>
param(
    [switch]$SelfContained,
    [switch]$CreateZip,
    [switch]$SkipWebBuild
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$rendererDir = Join-Path $repoRoot 'src\Renderer.Web'
$hostProject = Join-Path $repoRoot 'src\Host.Win32\Host.Win32.csproj'
$releaseDir = Join-Path $repoRoot 'build\release\NekoScape'
$wwwDest = Join-Path $releaseDir 'www'
$configDest = Join-Path $releaseDir 'config'

if (-not $SkipWebBuild) {
    Write-Host '[1/4] Building Renderer.Web...'
    Push-Location $rendererDir
    try {
        if (-not (Test-Path (Join-Path $rendererDir 'node_modules'))) {
            npm ci
            if ($LASTEXITCODE -ne 0) {
                throw "npm ci failed with exit code $LASTEXITCODE"
            }
        }
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host '[1/4] Skipping Renderer.Web build (using existing dist/)...'
}

Write-Host '[2/4] Preparing release directory...'
Get-Process -Name 'NekoScape', 'Host.Win32' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 400
if (Test-Path $releaseDir) {
    Remove-Item -Recurse -Force $releaseDir
}
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

Write-Host '[3/4] Publishing Host.Win32 (net10.0-windows, x64)...'
$selfContainedArg = if ($SelfContained) { 'true' } else { 'false' }
dotnet publish $hostProject `
    -c Release `
    -r win-x64 `
    --self-contained $selfContainedArg `
    -o $releaseDir
if ($LASTEXITCODE -ne 0) {
    throw "dotnet publish failed with exit code $LASTEXITCODE"
}

Write-Host '[4/4] Copying web bundle and default settings...'
$distDir = Join-Path $rendererDir 'dist'
if (-not (Test-Path $distDir)) {
    throw "Renderer dist directory not found: $distDir"
}
New-Item -ItemType Directory -Force -Path $wwwDest | Out-Null
Copy-Item -Path (Join-Path $distDir '*') -Destination $wwwDest -Recurse -Force

$defaultSettings = Join-Path $repoRoot 'config\default-settings.json'
if (-not (Test-Path $defaultSettings)) {
    throw "Default settings file not found: $defaultSettings"
}
New-Item -ItemType Directory -Force -Path $configDest | Out-Null
Copy-Item -Path $defaultSettings -Destination (Join-Path $configDest 'default-settings.json') -Force

if ($CreateZip) {
    $zipPath = Join-Path $repoRoot 'build\release\NekoScape-win-x64-portable.zip'
    if (Test-Path $zipPath) {
        Remove-Item -Force $zipPath
    }
    Compress-Archive -Path (Join-Path $releaseDir '*') -DestinationPath $zipPath
    Write-Host "Created portable archive: $zipPath"
}

Write-Host "Portable build ready at: $releaseDir"
