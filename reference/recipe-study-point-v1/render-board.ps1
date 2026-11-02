Add-Type -AssemblyName System.Drawing
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$manifest=Get-Content -Raw -Encoding utf8 (Join-Path $root 'assets/dungeon/recipe-study-point-v1/manifest.json') | ConvertFrom-Json
$board=Get-Content -Raw -Encoding utf8 (Join-Path $PSScriptRoot 'board-geometry.json') | ConvertFrom-Json
$pm=Get-Content -Raw -Encoding utf8 (Join-Path $root 'assets/map/isometric/player-atlas-v1/manifest.json') | ConvertFrom-Json
$ps=$pm.states[0]
$player=[System.Drawing.Bitmap]::new((Join-Path $root ('assets/map/isometric/player-atlas-v1/'+$ps.file)))
$boss=[System.Drawing.Bitmap]::new((Join-Path $root 'assets/map/isometric/street-thug-boss-v1/standing.png'))
$out=[System.Drawing.Bitmap]::new(1160,650)
$g=[System.Drawing.Graphics]::FromImage($out)
$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::FromArgb(28,38,34))
$ink=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(239,229,206))
$pen=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(100,180,186,160),1)
$font=[System.Drawing.Font]::new('Microsoft YaHei',13)
$title=[System.Drawing.Font]::new('Microsoft YaHei',18,[System.Drawing.FontStyle]::Bold)
function Draw-Pawn($im,$crop,$anchor,[double]$scale,[double]$x,[double]$y){
  $dst=[System.Drawing.RectangleF]::new([single]($x+($crop[0]-$anchor[0])*$scale),[single]($y+($crop[1]-$anchor[1])*$scale),[single]($crop[2]*$scale),[single]($crop[3]*$scale))
  $src=[System.Drawing.RectangleF]::new([single]$crop[0],[single]$crop[1],[single]$crop[2],[single]$crop[3])
  $g.DrawImage($im,$dst,$src,[System.Drawing.GraphicsUnit]::Pixel)
}
for($panel=0;$panel -lt 2;$panel++){
 $offsetX=58+$panel*580;$offsetY=55
 $a=$manifest.assets[$panel]
 $label=if($panel -eq 0){'可研究 · 资料展开'}else{'已使用 · 资料合拢'}
 $g.DrawString($label,$title,$ink,[single]($offsetX-20),25)
 foreach($cell in $board.cells){
   $points=[System.Drawing.PointF[]]@($cell.polygon | ForEach-Object{[System.Drawing.PointF]::new([single]($_.x+$offsetX),[single]($_.y+$offsetY))})
   $color=if(($cell.x+$cell.y)%2){[System.Drawing.Color]::FromArgb(75,85,72)}else{[System.Drawing.Color]::FromArgb(70,80,68)}
   $brush=[System.Drawing.SolidBrush]::new($color);$g.FillPolygon($brush,$points);$g.DrawPolygon($pen,$points);$brush.Dispose()
 }
 # A simple back-wall plane allows checking the silhouette beside a wall; it is review scenery only.
 $rawEdge=$board.cells[1].polygon
 $edge=@($rawEdge[2],$rawEdge[3])
 $wall=[System.Drawing.PointF[]]@([System.Drawing.PointF]::new([single]($edge[0].x+$offsetX),[single]($edge[0].y+$offsetY-62)),[System.Drawing.PointF]::new([single]($edge[1].x+$offsetX),[single]($edge[1].y+$offsetY-62)),[System.Drawing.PointF]::new([single]($edge[1].x+$offsetX),[single]($edge[1].y+$offsetY)),[System.Drawing.PointF]::new([single]($edge[0].x+$offsetX),[single]($edge[0].y+$offsetY)))
 $wallBrush=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(92,95,83));$g.FillPolygon($wallBrush,$wall);$g.DrawPolygon($pen,$wall);$wallBrush.Dispose()
 $im=[System.Drawing.Bitmap]::new((Join-Path $root $a.src))
 $shadow=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(55,12,17,14))
 $g.FillEllipse($shadow,[single]($board.desk.x+$offsetX-51),[single]($board.desk.y+$offsetY-30),[single]112,[single]69);$shadow.Dispose()
 Draw-Pawn $im $a.crop $a.anchor $a.scaleAt144 ($board.desk.x+$offsetX) ($board.desk.y+$offsetY)
 $anchor=@(($ps.crop[0]+$ps.anchor[0]),($ps.crop[1]+$ps.anchor[1]))
 Draw-Pawn $player $ps.crop $anchor ($pm.displayBaseWidth/$ps.baseWidth*1.25) ($board.player.x+$offsetX) ($board.player.y+$offsetY)
 Draw-Pawn $boss @(240,40,715,1200) @(597.5,1238) (46/715*1.25) ($board.boss.x+$offsetX) ($board.boss.y+$offsetY)
 $im.Dispose()
 $g.DrawString('144px棋格 · 人物125% · 桌面实体高度约40px',$font,$ink,[single]($offsetX-20),535)
 $g.DrawString('桌体两态共用位置和等比缩放 · 阴影独立',$font,$ink,[single]($offsetX-20),567)
}
$g.DrawString('旧工艺资料台 / v1  外观候选',$title,$ink,38,610)
$out.Save((Join-Path $PSScriptRoot 'board-144px.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$out.Dispose();$player.Dispose();$boss.Dispose();$font.Dispose();$title.Dispose();$ink.Dispose();$pen.Dispose()
