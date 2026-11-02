Add-Type -AssemblyName System.Drawing
$specs=@(
 @{id='archive-shelf';w=.70;d=.44;h=72;title='Repaired archive shelf';shape='box'},
 @{id='drawing-rolls';w=.55;d=.45;h=36;title='Drawing tube cradle';shape='box'},
 @{id='patched-stool';w=.42;d=.42;h=24;title='Patched workshop stool';shape='stool'}
)
foreach($spec in $specs){
 $factor=6.0;$originX=512.0;$originY=760.0
 function Project-Prop([double]$x,[double]$y,[double]$z){[System.Drawing.PointF]::new([single]($originX+($x-$y)*72*$factor),[single]($originY+(($x+$y)*72/[Math]::Sqrt(2)-$z)*$factor))}
 $w=$spec.w/2;$d=$spec.d/2
 $bottom=[System.Drawing.PointF[]]@((Project-Prop (-$w) (-$d) 0),(Project-Prop $w (-$d) 0),(Project-Prop $w $d 0),(Project-Prop (-$w) $d 0))
 $top=[System.Drawing.PointF[]]@((Project-Prop (-$w) (-$d) $spec.h),(Project-Prop $w (-$d) $spec.h),(Project-Prop $w $d $spec.h),(Project-Prop (-$w) $d $spec.h))
 $bitmap=[System.Drawing.Bitmap]::new(1024,1024);$g=[System.Drawing.Graphics]::FromImage($bitmap);$g.SmoothingMode='AntiAlias';$g.Clear([System.Drawing.Color]::FromArgb(250,249,243))
 $edge=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(57,98,133),7);$ground=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(169,108,41),4)
 $fill=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(80,85,145,180));$ink=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(45,53,60));$font=[System.Drawing.Font]::new('Arial',17)
 $g.DrawPolygon($ground,$bottom);$g.FillPolygon($fill,$top);$g.DrawPolygon($edge,$top)
 for($i=0;$i -lt 4;$i++){$g.DrawLine($edge,$bottom[$i],$top[$i])}
 if($spec.id -eq 'archive-shelf'){foreach($z in @(22,45)){ $a=Project-Prop (-$w) $d $z;$b=Project-Prop $w $d $z;$g.DrawLine($edge,$a,$b)}}
 $g.DrawString(('GEOMETRY ONLY - '+$spec.title),$font,$ink,20,20)
 $g.DrawString('144px tile; orthographic axes +/- 1/sqrt(2); vertical edges',$font,$ink,20,54)
 $g.DrawString(('Footprint '+$spec.w+' x '+$spec.d+' tile; physical height '+$spec.h+'px'),$font,$ink,20,940)
 $g.DrawString('Front faces +Y. No floor slab, no display base, no baked shadow.',$font,$ink,20,975)
 $bitmap.Save((Join-Path $PSScriptRoot ($spec.id+'-geometry.png')),[System.Drawing.Imaging.ImageFormat]::Png)
 [ordered]@{id=$spec.id;tileWidth=144;tileHeight=144/[Math]::Sqrt(2);physicalFootprint=@($spec.w,$spec.d);physicalHeightAt144=$spec.h;nativeFront=@(0,1);factor=$factor;origin=@($originX,$originY);groundCorners=@($bottom|ForEach-Object{@($_.X,$_.Y)});status='pre-generation geometry reference only'}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $PSScriptRoot ($spec.id+'-geometry.json')) -Encoding utf8
 $g.Dispose();$bitmap.Dispose();$edge.Dispose();$ground.Dispose();$fill.Dispose();$ink.Dispose();$font.Dispose()
}
