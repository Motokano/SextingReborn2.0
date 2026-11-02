Add-Type -AssemblyName System.Drawing
$factor = 6.0
$originX = 512.0
$originY = 650.0
function Project-StudyPoint([double]$x, [double]$y, [double]$z) {
    [System.Drawing.PointF]::new([single]($originX + ($x - $y) * 72 * $factor), [single]($originY + (($x + $y) * 72 / [Math]::Sqrt(2) - $z) * $factor))
}
$bottom = [System.Drawing.PointF[]]@((Project-StudyPoint -.36 -.36 0), (Project-StudyPoint .36 -.36 0), (Project-StudyPoint .36 .36 0), (Project-StudyPoint -.36 .36 0))
$top = [System.Drawing.PointF[]]@((Project-StudyPoint -.36 -.36 40), (Project-StudyPoint .36 -.36 40), (Project-StudyPoint .36 .36 40), (Project-StudyPoint -.36 .36 40))
$bitmap = [System.Drawing.Bitmap]::new(1024,1024)
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(250,249,243))
$groundPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(169,108,41), 4)
$edgePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(57,98,133), 9)
$fill = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(90,85,145,180))
$g.DrawPolygon($groundPen,$bottom)
for($i=0;$i -lt 4;$i++) { $g.DrawLine($edgePen,$bottom[$i],$top[$i]) }
$g.FillPolygon($fill,$top)
$g.DrawPolygon($edgePen,$top)
$font = [System.Drawing.Font]::new('Arial',17)
$textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(45,53,60))
$g.DrawString('GEOMETRY ONLY - compact recipe reading desk; no ground slab', $font, $textBrush, 20, 15)
$g.DrawString('144px tile | axes +/- 1/sqrt(2) | orthographic | vertical legs', $font, $textBrush, 20, 48)
$g.DrawString('Physical footprint 0.72 x 0.72 tile | tabletop height 40px', $font, $textBrush, 20, 947)
$g.DrawString('Gold = contact footprint, blue = desk envelope. NOT surface artwork.', $font, $textBrush, 20, 977)
$g.FillEllipse($textBrush,[single]($originX-5),[single]($originY-5),10,10)
$bitmap.Save((Join-Path $PSScriptRoot 'geometry.png'),[System.Drawing.Imaging.ImageFormat]::Png)
[ordered]@{ referenceTileWidth=144; referenceTileHeight=144/[Math]::Sqrt(2); proposedLogicalFootprint=@(1,1); physicalFootprint=@(.72,.72); tabletopHeightAt144=40; nativeFront=@(0,1); scale=$factor; origin=@($originX,$originY); groundCorners=@($bottom | ForEach-Object { @([Math]::Round($_.X,3),[Math]::Round($_.Y,3)) }); status='pre-generation art guide, not runtime collision'; purpose='Preserve native projection and equal scaling; never distort generated PNG to fit.' } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'geometry.json') -Encoding utf8
$g.Dispose();$bitmap.Dispose();$groundPen.Dispose();$edgePen.Dispose();$fill.Dispose();$font.Dispose();$textBrush.Dispose()
