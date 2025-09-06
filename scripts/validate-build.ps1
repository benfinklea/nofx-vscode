#!/usr/bin/env pwsh
# PowerShell validation script for Windows build verification
# Mirrors essential checks from validate-build.sh

$ErrorActionPreference = "Stop"

Write-Host "NofX Build Validator (PowerShell)" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

$exitCode = 0
$errorMessages = @()

# Check if out/extension.js exists
Write-Host "Checking for out/extension.js..." -NoNewline
if (Test-Path "out/extension.js") {
    $fileInfo = Get-Item "out/extension.js"
    $sizeKB = [math]::Round($fileInfo.Length / 1024, 2)
    
    if ($fileInfo.Length -ge 1024) {
        Write-Host " ✓" -ForegroundColor Green
        Write-Host "  Size: $sizeKB KB" -ForegroundColor Gray
    } else {
        Write-Host " ✗" -ForegroundColor Red
        Write-Host "  File too small: $sizeKB KB (expected >= 1KB)" -ForegroundColor Red
        $errorMessages += "out/extension.js is too small ($sizeKB KB)"
        $exitCode = 1
    }
} else {
    Write-Host " ✗" -ForegroundColor Red
    Write-Host "  File not found!" -ForegroundColor Red
    $errorMessages += "out/extension.js not found"
    $exitCode = 1
}

# Check package.json main field
Write-Host "Checking package.json main field..." -NoNewline
try {
    $packageJson = Get-Content "package.json" | ConvertFrom-Json
    $mainFile = $packageJson.main
    
    if ($mainFile -and (Test-Path $mainFile)) {
        Write-Host " ✓" -ForegroundColor Green
        Write-Host "  Main field points to: $mainFile" -ForegroundColor Gray
    } else {
        Write-Host " ✗" -ForegroundColor Red
        if (-not $mainFile) {
            Write-Host "  Missing 'main' field in package.json" -ForegroundColor Red
            $errorMessages += "package.json missing 'main' field"
        } else {
            Write-Host "  Main file does not exist: $mainFile" -ForegroundColor Red
            $errorMessages += "Main file specified in package.json does not exist: $mainFile"
        }
        $exitCode = 1
    }
} catch {
    Write-Host " ✗" -ForegroundColor Red
    Write-Host "  Failed to read package.json: $_" -ForegroundColor Red
    $errorMessages += "Failed to read package.json"
    $exitCode = 1
}

# Check for compiled JS files in out/
Write-Host "Checking for compiled files in out/..." -NoNewline
$jsFiles = Get-ChildItem -Path "out" -Filter "*.js" -ErrorAction SilentlyContinue
if ($jsFiles -and $jsFiles.Count -gt 0) {
    Write-Host " ✓" -ForegroundColor Green
    Write-Host "  Found $($jsFiles.Count) .js files" -ForegroundColor Gray
} else {
    Write-Host " ✗" -ForegroundColor Red
    Write-Host "  No .js files found in out/" -ForegroundColor Red
    $errorMessages += "No compiled .js files found in out/"
    $exitCode = 1
}

# Try to verify extension can be loaded
Write-Host "Verifying extension module..." -NoNewline
try {
    $output = node -e "const ext = require('./out/extension.js'); if (!ext.activate || !ext.deactivate) throw new Error('Missing exports'); console.log('OK');" 2>&1
    if ($LASTEXITCODE -eq 0 -and $output -match "OK") {
        Write-Host " ✓" -ForegroundColor Green
        Write-Host "  Extension exports verified" -ForegroundColor Gray
    } else {
        Write-Host " ⚠" -ForegroundColor Yellow
        Write-Host "  Could not verify exports (non-critical)" -ForegroundColor Yellow
    }
} catch {
    Write-Host " ⚠" -ForegroundColor Yellow
    Write-Host "  Could not verify module (non-critical)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=================================" -ForegroundColor Cyan

if ($exitCode -eq 0) {
    Write-Host "✓ Build validation passed!" -ForegroundColor Green
} else {
    Write-Host "✗ Build validation failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Errors:" -ForegroundColor Red
    foreach ($error in $errorMessages) {
        Write-Host "  - $error" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Please run 'npm run compile' to build the extension." -ForegroundColor Yellow
}

exit $exitCode