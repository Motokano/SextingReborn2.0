Add-Type -AssemblyName System.Drawing
$assetRoot = $PSScriptRoot
$size = 1024
$factor = 14.0
$originX = 512.0
$originY = 741.0
$halfX = 0.36 / 2
$halfY = 0.22 / 2
$height = 32.0
function Project-BagPoint([double]$x, [double]$y, [double]$z) {
    [System.Drawing.PointF]::new([single]($originX + ($x - $y) * 72 * $factor), [single]($originY + (($x + $y) * 72 / [Math]::Sqrt(2) - $z) * $factor))
}
$bottom = [System.Drawing.PointF[]]@((Project-BagPoint (-$halfX) (-$halfY) 0), (Project-BagPoint $halfX (-$halfY) 0), (Project-BagPoint $halfX $halfY 0), (Project-BagPoint (-$halfX) $halfY 0))
$top = [System.Drawing.PointF[]]@((Project-BagPoint (-$halfX) (-$halfY) $height), (Project-BagPoint $halfX (-$halfY) $height), (Project-BagPoint $halfX $halfY $height), (Project-BagPoint (-$halfX) $halfY $height))
$bitmap = [System.Drawing.Bitmap]::new($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(250,249,243))
$groundPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(169,108,41), 5)
$edgePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(57,98,133), 5)
$dashPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(160,171,178), 3)
$dashPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
$fill = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(32,85,145,180))
$graphics.FillPolygon($fill, $top)
$graphics.DrawPolygon($groundPen, $bottom)
$graphics.DrawPolygon($edgePen, $top)
for($i=0;$i -lt 4;$i++) { $graphics.DrawLine($(if($i -eq 0){$dashPen}else{$edgePen}),$bottom[$i],$top[$i]) }
$font = [System.Drawing.Font]::new('Arial',17)
$textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(45,53,60))
$graphics.DrawString('GEOMETRY ONLY - soft bag envelope, not final art', $font, $textBrush, 20, 10)
$graphics.DrawString('144 px tile | ground axes +/- 1/sqrt(2) | verticals stay vertical', $font, $textBrush, 20, 43)
$graphics.DrawString('Footprint 0.36 x 0.22 tile | body height 32 px at 144 px tile', $font, $textBrush, 20, 979)
$graphics.FillEllipse($textBrush,[single]($originX-5),[single]($originY-5),10,10)
$bitmap.Save((Join-Path $assetRoot 'geometry.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$points = @($bottom | ForEach-Object { @([Math]::Round($_.X,3),[Math]::Round($_.Y,3)) })
$record = [ordered]@{ referenceTileWidth=144; referenceTileHeight=144/[Math]::Sqrt(2); logicalCell=[int[]]@(1,1); blocksMovement=$false; bodyFootprint=[double[]]@(0.36,0.22); verticalBodyHeightAt144=32; nativeFront=[int[]]@(0,1); geometryScale=14; origin=[double[]]@($originX,$originY); groundCorners=$points; purpose='Pre-generation geometry envelope; generated result must be measured independently.' }
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $assetRoot 'geometry.json') -Encoding utf8
$graphics.Dispose(); $bitmap.Dispose(); $groundPen.Dispose(); $edgePen.Dispose(); $dashPen.Dispose(); $fill.Dispose(); $font.Dispose(); $textBrush.Dispose()
Write-Output 'Created geometry.png and geometry.json'
