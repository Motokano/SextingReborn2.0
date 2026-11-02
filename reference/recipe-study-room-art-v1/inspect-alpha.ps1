Add-Type -AssemblyName System.Drawing
$records = @()
foreach ($name in @('archive-shelf','drawing-rolls','patched-stool')) {
  $path = (Resolve-Path (Join-Path $PSScriptRoot ('../../assets/dungeon/recipe-study-room-art-v1/'+$name+'.png'))).Path
  $im = [System.Drawing.Bitmap]::new($path)
  $rect = [System.Drawing.Rectangle]::new(0,0,$im.Width,$im.Height)
  $bits = $im.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bytes = [byte[]]::new($bits.Stride*$im.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($bits.Scan0,$bytes,0,$bytes.Length)
  $zero=0;$solid=0;$partial=0;$minX=$im.Width;$minY=$im.Height;$maxX=0;$maxY=0
  for ($y=0;$y -lt $im.Height;$y++) { for ($x=0;$x -lt $im.Width;$x++) {
    $alpha=$bytes[$y*$bits.Stride+$x*4+3]
    if($alpha -eq 0){$zero++}elseif($alpha -eq 255){$solid++}else{$partial++}
    if($alpha -gt 16){$minX=[Math]::Min($minX,$x);$minY=[Math]::Min($minY,$y);$maxX=[Math]::Max($maxX,$x);$maxY=[Math]::Max($maxY,$y)}
  }}
  $im.UnlockBits($bits)
  $records += [ordered]@{state=$name;source=('assets/dungeon/recipe-study-room-art-v1/'+$name+'.png');width=$im.Width;height=$im.Height;alphaBounds=@($minX,$minY,($maxX+1),($maxY+1));transparent=$zero;opaque=$solid;partial=$partial;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
  $im.Dispose()
}
$records | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'alpha-checks.json') -Encoding utf8
$records | ConvertTo-Json -Depth 6
