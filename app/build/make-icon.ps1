Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

$rect = New-Object System.Drawing.RectangleF(16, 16, 480, 480)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $rect,
  [System.Drawing.Color]::FromArgb(255, 126, 91, 255),
  [System.Drawing.Color]::FromArgb(255, 64, 154, 255),
  45.0
)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 108.0
$diameter = $radius * 2
$path.AddArc(16, 16, $diameter, $diameter, 180, 90)
$path.AddArc(496 - $diameter, 16, $diameter, $diameter, 270, 90)
$path.AddArc(496 - $diameter, 496 - $diameter, $diameter, $diameter, 0, 90)
$path.AddArc(16, 496 - $diameter, $diameter, $diameter, 90, 90)
$path.CloseFigure()
$g.FillPath($brush, $path)

$font = New-Object System.Drawing.Font('Microsoft YaHei UI', 250, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString('汉', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(0, -10, $size, $size)), $format)

$bmp.Save((Join-Path $PSScriptRoot 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
