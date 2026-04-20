$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
  node scripts/export-viewer-data.js
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  $viewerPath = Join-Path $root "viewer.html"
  Start-Process $viewerPath
}
finally {
  Pop-Location
}
