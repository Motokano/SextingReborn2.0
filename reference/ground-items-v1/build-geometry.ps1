Add-Type -AssemblyName System.Drawing
$size = 1024
$factor = 18.0
$originX = 512.0
$originY = 610.0
$halfX = 0.34 / 2
$halfY = 0.24 / 2
$height = 10.0
function Project-PilePoint([double]$x, [double]$y, [double]$z) {
    [System.Drawing.PointF]::new([single]($originX + ($x - $y) * 72 * $factor), [single]($originY + (($x + $y) * 72 / [Math]::Sqrt(2) - $z) * $factor))
}
$bottom = [System.Drawing.PointF[]]@((Project-PilePoint (-$halfX) (-$halfY) 0), (Project-PilePoint $halfX (-$halfY) 0), (Project-PilePoint $halfX $halfY 0), (Project-PilePoint (-$halfX) $halfY 0))
$top = [System.Drawing.PointF[]]@((Project-PilePoint (-$halfX) (-$halfY) $height), (Project-PilePoint $halfX (-$halfY) $height), (Project-PilePoint $halfX $halfY $height), (Project-PilePoint (-$halfX) $halfY $height))
$bitmap = [System.Drawing.Bitmap]::new($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(250,249,243))
$groundPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(169,108,41), 5)
$edgePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(57,98,133), 5)
$fill = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(32,85,145,180))
$g.FillPolygon($fill, $top)
$g.DrawPolygon($groundPen, $bottom)
$g.DrawPolygon($edgePen, $top)
for($i=0;$i -lt 4;$i++) { $g.DrawLine($edgePen,$bottom[$i],$top[$i]) }
$font = [System.Drawing.Font]::new('Arial',17)
$textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(45,53,60))
$g.DrawString('GEOMETRY ONLY - low loose item pile, not a box or pedestal', $font, $textBrush, 20, 12)
$g.DrawString('144 px tile | ground axes +/- 1/sqrt(2) | verticals vertical', $font, $textBrush, 20, 45)
$g.DrawString('Footprint 0.34 x 0.24 tile | height 10 px | ground contact at dot', $font, $textBrush, 20, 978)
$g.FillEllipse($textBrush,[single]($originX-5),[single]($originY-5),10,10)
$bitmap.Save((Join-Path $PSScriptRoot 'geometry.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$record = [ordered]@{ referenceTileWidth=144; referenceTileHeight=144/[Math]::Sqrt(2); logicalCell=[int[]]@(1,1); blocksMovement=$false; footprint=[double[]]@(0.34,0.24); verticalHeightAt144=$height; nativeFront=[int[]]@(0,1); geometryScale=$factor; origin=[double[]]@($originX,$originY); groundCorners=@($bottom | ForEach-Object { @([Math]::Round($_.X,3),[Math]::Round($_.Y,3)) }); purpose='Pre-generation loose-pile envelope only, not a hard box. Final art is measured independently without distortion.' }
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'geometry.json') -Encoding utf8
$g.Dispose(); $bitmap.Dispose(); $groundPen.Dispose(); $edgePen.Dispose(); $fill.Dispose(); $font.Dispose(); $textBrush.Dispose()
