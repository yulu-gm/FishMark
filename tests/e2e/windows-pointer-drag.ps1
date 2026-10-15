param([long]$WindowHandle,[int]$OwnerPid,[int]$StartX,[int]$StartY,[int]$EndX,[int]$EndY,[long]$EndWindowHandle=0,[ValidateRange(0,500)][int]$ReleaseDelayMs=0,[Parameter(Mandatory)][string]$EvidencePath,[Parameter(Mandatory)][long]$PreparationDeadlineEpochMs)
$ErrorActionPreference='Stop'
$elapsed=[Diagnostics.Stopwatch]::StartNew()
$phases=New-Object 'System.Collections.Generic.List[string]'
function Mark-PointerPhase([string]$phase) {
 $phases.Add(('{"phase":"'+$phase+'","epochMs":'+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+',"elapsedMs":'+$elapsed.ElapsedMilliseconds+'}'))
}
function Flush-PointerPhases {
 if($phases.Count -eq 0){return}
 [IO.File]::AppendAllText($EvidencePath,([string]::Join("`n",$phases)+"`n"))
 $phases.Clear()
}
Mark-PointerPhase 'script-enter'; Flush-PointerPhases
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RF902Pointer {
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x,y; }
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left,top,right,bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct GUI { public int size,flags; public IntPtr active,focus,capture,menu,move,caret; public RECT rect; }
 [StructLayout(LayoutKind.Sequential)] public struct MOUSE { public int dx,dy; public uint data,flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public MOUSE mouse; }
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint t,ref GUI g);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")] public static extern uint SendInput(uint n,INPUT[] i,int s);
 public static void Button(uint flag) { var i=new INPUT {type=0,mouse=new MOUSE {flags=flag}}; if(SendInput(1,new[]{i},Marshal.SizeOf(typeof(INPUT)))!=1) throw new Exception("SendInput failed"); }
}
'@
Mark-PointerPhase 'compiled'; Flush-PointerPhases
# Load the serializer before any input, then re-check all native identities.
$null=@{warm=$true}|ConvertTo-Json -Compress
Mark-PointerPhase 'serializer-ready'; Flush-PointerPhases
if([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -gt $PreparationDeadlineEpochMs){throw 'Native pointer preparation exceeded 25s; no activation or input sent.'}
$target=[IntPtr]$WindowHandle
[uint32]$observedPid=0
$thread=[RF902Pointer]::GetWindowThreadProcessId($target,[ref]$observedPid)
if($observedPid -ne $OwnerPid){throw 'Test window ownership changed.'}
if([RF902Pointer]::GetForegroundWindow() -ne $target){
 [uint32]$foregroundPid=0
 $foregroundThread=[RF902Pointer]::GetWindowThreadProcessId([RF902Pointer]::GetForegroundWindow(),[ref]$foregroundPid)
 $callerThread=[RF902Pointer]::GetCurrentThreadId()
 $attached=[RF902Pointer]::AttachThreadInput($callerThread,$foregroundThread,$true)
 try {[void][RF902Pointer]::SetForegroundWindow($target)}
 finally {if($attached){[void][RF902Pointer]::AttachThreadInput($callerThread,$foregroundThread,$false)}}
 Start-Sleep -Milliseconds 150
}
# Windows may deny programmatic activation. The verified owned-window mouse
# press below is then the real activation gesture; never click an unowned hit.
$initialForeground=[RF902Pointer]::GetForegroundWindow().ToInt64()
$rect=New-Object RF902Pointer+RECT
[void][RF902Pointer]::GetWindowRect($target,[ref]$rect)
if($StartX -le $rect.left -or $StartX -ge $rect.right -or $StartY -le $rect.top -or $StartY -ge $rect.bottom){throw 'Start is outside owned window.'}
if($EndX -ge $rect.left -and $EndX -lt $rect.right -and $EndY -ge $rect.top -and $EndY -lt $rect.bottom){throw 'Endpoint must leave owned top-level window.'}
$original=New-Object RF902Pointer+POINT
[void][RF902Pointer]::GetCursorPos([ref]$original)
$down=$false
try {
 Mark-PointerPhase 'prepared'; Flush-PointerPhases
 if([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -gt $PreparationDeadlineEpochMs){throw 'Native pointer preparation exceeded 25s; no input sent.'}
 $gestureElapsed=[Diagnostics.Stopwatch]::StartNew()
 [void][RF902Pointer]::SetCursorPos($StartX,$StartY)
 Start-Sleep -Milliseconds 80
 $point=New-Object RF902Pointer+POINT; $point.x=$StartX; $point.y=$StartY
 [uint32]$hitPid=0
 $startHit=[RF902Pointer]::WindowFromPoint($point)
 [void][RF902Pointer]::GetWindowThreadProcessId($startHit,[ref]$hitPid)
 if($hitPid -ne $OwnerPid){throw 'Pointer start does not hit owned window.'}
 if([RF902Pointer]::GetAncestor($startHit,2) -ne $target){throw 'Pointer start does not hit the exact source window.'}
 if([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -gt $PreparationDeadlineEpochMs){throw 'Native pointer preparation exceeded 25s; no press sent.'}
 [RF902Pointer]::Button(2); $down=$true; Mark-PointerPhase 'pressed'
 Start-Sleep -Milliseconds 100
 [void][RF902Pointer]::SetCursorPos(($StartX+10),$StartY)
 Start-Sleep -Milliseconds 100
 $gui=New-Object RF902Pointer+GUI; $gui.size=[System.Runtime.InteropServices.Marshal]::SizeOf($gui)
 [void][RF902Pointer]::GetGUIThreadInfo($thread,[ref]$gui)
 [uint32]$capturePid=0
 [void][RF902Pointer]::GetWindowThreadProcessId($gui.capture,[ref]$capturePid)
 if($capturePid -ne $OwnerPid){throw 'No owned native capture; refusing to move onto another application.'}
 if([RF902Pointer]::GetForegroundWindow() -ne $target){throw 'Foreground changed during gesture.'}
 for($i=1;$i -le 12;$i++){[void][RF902Pointer]::SetCursorPos(($StartX+[int](($EndX-$StartX)*$i/12)),($StartY+[int](($EndY-$StartY)*$i/12))); Start-Sleep -Milliseconds 15}
 [void][RF902Pointer]::GetGUIThreadInfo($thread,[ref]$gui)
 [uint32]$releaseCapturePid=0
 [void][RF902Pointer]::GetWindowThreadProcessId($gui.capture,[ref]$releaseCapturePid)
 if($releaseCapturePid -ne $OwnerPid){throw 'Owned capture was lost before outside release.'}
 $endPoint=New-Object RF902Pointer+POINT; $endPoint.x=$EndX; $endPoint.y=$EndY
 $endHit=[RF902Pointer]::GetAncestor([RF902Pointer]::WindowFromPoint($endPoint),2).ToInt64()
 if($EndWindowHandle -ne 0 -and $endHit -ne $EndWindowHandle){throw 'Endpoint does not hit the expected existing test window.'}
 if($gestureElapsed.ElapsedMilliseconds -gt 3000){throw 'Native held gesture exceeded 3s; cancelling at the source.'}
 [RF902Pointer]::Button(4); $down=$false; Mark-PointerPhase 'released'; Flush-PointerPhases
 if($ReleaseDelayMs -gt 0){Start-Sleep -Milliseconds $ReleaseDelayMs}
 $proof=@{ method='Windows SetCursorPos + SendInput'; ownerPid=$OwnerPid; hwnd=$WindowHandle; initialForeground=$initialForeground; windowRect=$rect; start=@{x=$StartX;y=$StartY}; end=@{x=$EndX;y=$EndY}; endHit=$endHit; capturePidBeforeExit=$capturePid; capturePidAtRelease=$releaseCapturePid; releasedOutside=$true } | ConvertTo-Json -Depth 5 -Compress
 Mark-PointerPhase 'serialized'; Flush-PointerPhases
} finally {
 if($down){[void][RF902Pointer]::SetCursorPos($StartX,$StartY); [RF902Pointer]::Button(4); Mark-PointerPhase 'cancelled-release'}
 [void][RF902Pointer]::SetCursorPos($original.x,$original.y)
 Mark-PointerPhase 'restored'; Flush-PointerPhases
}
Mark-PointerPhase 'finished'; Flush-PointerPhases
$proof
