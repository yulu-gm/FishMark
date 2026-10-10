param([Int64]$OwnedHandle, [string]$OutputPath)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class OwnedCaptureNative {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; }
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
}
'@
$ownedWindow = [IntPtr]$OwnedHandle
if ([OwnedCaptureNative]::GetForegroundWindow() -ne $ownedWindow) { throw 'Owned Electron window is not foreground; screen capture refused' }
$captureRect = New-Object OwnedCaptureNative+RECT
$capturePoint = New-Object OwnedCaptureNative+POINT
if (-not [OwnedCaptureNative]::GetClientRect($ownedWindow,[ref]$captureRect)) { throw 'No owned client rectangle' }
if (-not [OwnedCaptureNative]::ClientToScreen($ownedWindow,[ref]$capturePoint)) { throw 'No client screen position' }
$captureBitmap = New-Object System.Drawing.Bitmap($captureRect.Right,$captureRect.Bottom)
$captureGraphics = [System.Drawing.Graphics]::FromImage($captureBitmap)
try {
 for ($captureIndex=0; $captureIndex -lt 12; $captureIndex++) {
  if ([OwnedCaptureNative]::GetForegroundWindow() -ne $ownedWindow) { throw 'Foreground changed during owned capture' }
  $captureGraphics.CopyFromScreen($capturePoint.X,$capturePoint.Y,0,0,$captureBitmap.Size)
  $framePath = $OutputPath.Replace('.png', ('-frame'+$captureIndex+'.png'))
  $captureBitmap.Save($framePath,[System.Drawing.Imaging.ImageFormat]::Png)
  Start-Sleep -Milliseconds 100
 }
} finally { $captureGraphics.Dispose(); $captureBitmap.Dispose() }
