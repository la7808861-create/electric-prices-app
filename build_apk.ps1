$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceAndroid = Join-Path $root "android_app"
$stageRoot = Join-Path $env:TEMP "electric_prices_apk_build"
$android = Join-Path $stageRoot "android_app"
$out = Join-Path $root "apk_output"
$build = Join-Path $android "build"
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { throw "ANDROID_HOME is not set" }

$platform = Join-Path $sdk "platforms\android-36\android.jar"
if (-not (Test-Path $platform)) { $platform = Join-Path $sdk "platforms\android-34\android.jar" }
$buildTools = Join-Path $sdk "build-tools\36.0.0"
if (-not (Test-Path $buildTools)) { $buildTools = Join-Path $sdk "build-tools\34.0.0" }

$aapt2 = Join-Path $buildTools "aapt2.exe"
$d8 = Join-Path $buildTools "d8.bat"
$zipalign = Join-Path $buildTools "zipalign.exe"
$apksigner = Join-Path $buildTools "apksigner.bat"

function Run-Tool {
  $CommandArgs = $args
  $exe = $CommandArgs[0]
  $toolArgs = @()
  if ($CommandArgs.Count -gt 1) {
    $toolArgs = $CommandArgs[1..($CommandArgs.Count - 1)]
  }
  & $exe @toolArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $exe"
  }
}

New-Item -ItemType Directory -Force -Path $out, $build | Out-Null
Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null
Copy-Item -LiteralPath $sourceAndroid -Destination $stageRoot -Recurse -Force
New-Item -ItemType Directory -Force -Path "$build\compiled", "$build\classes", "$build\dex" | Out-Null

Run-Tool $aapt2 compile --dir "$android\res" -o "$build\compiled\res.zip"
Run-Tool $aapt2 link -o "$build\base.apk" -I $platform --manifest "$android\AndroidManifest.xml" "$build\compiled\res.zip" --java "$build\gen" --auto-add-overlay

$javaFiles = Get-ChildItem -Path "$android\src", "$build\gen" -Filter *.java -Recurse | ForEach-Object { $_.FullName }
Run-Tool javac -encoding UTF-8 -source 8 -target 8 -classpath $platform -d "$build\classes" $javaFiles
Push-Location "$build\classes"
Run-Tool jar cf "$build\classes.jar" .
Pop-Location
Run-Tool $d8 --release --min-api 23 --lib $platform --output "$build\dex" "$build\classes.jar"

Run-Tool $aapt2 link -o "$build\with_dex.apk" -I $platform --manifest "$android\AndroidManifest.xml" "$build\compiled\res.zip" --java "$build\gen" --auto-add-overlay
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("$build\with_dex.apk", "Update")
$entry = $zip.CreateEntry("classes.dex")
$entryStream = $entry.Open()
$fileStream = [System.IO.File]::OpenRead("$build\dex\classes.dex")
$fileStream.CopyTo($entryStream)
$fileStream.Close()
$entryStream.Close()
$zip.Dispose()

$keystore = Join-Path $stageRoot "electric_prices_debug.keystore"
if (-not (Test-Path $keystore)) {
  Run-Tool keytool -genkeypair -v -keystore $keystore -storepass 123456 -keypass 123456 -alias electricprices -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Electric Prices, OU=Sales, O=Complex, L=Baghdad, S=Baghdad, C=IQ"
}

$signedApk = Join-Path $stageRoot "electric_prices.apk"
Run-Tool $zipalign -f 4 "$build\with_dex.apk" "$build\aligned.apk"
Run-Tool $apksigner sign --ks $keystore --ks-pass pass:123456 --key-pass pass:123456 --out $signedApk "$build\aligned.apk"
Run-Tool $apksigner verify $signedApk
$apkPath = Join-Path $out "electric_prices.apk"
Copy-Item -LiteralPath $signedApk -Destination $apkPath -Force

Write-Host "APK ready:" $apkPath
