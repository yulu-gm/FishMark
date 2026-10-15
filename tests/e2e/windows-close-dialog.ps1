param(
 [Parameter(Mandatory)][string]$TelemetryPath,
 [Parameter(Mandatory)][string]$OutputPath,
 [Parameter(Mandatory)][ValidateSet('Save',"Don't Save",'Cancel')][string]$Choice,
 [ValidateRange(1,10)][int]$PromptIndex=1,
 [ValidateRange(1,60)][int]$TimeoutSeconds=25
)
$ErrorActionPreference='Stop'
$deadline=[DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
$proof=[ordered]@{status='running';choice=$Choice;promptIndex=$PromptIndex;startedEpochMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();candidates=@()}
function Save-Proof { $proof | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $OutputPath -Encoding utf8 }
Add-Type -TypeDefinition @'
using System;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Text;
public static class CloseDialog {
 public delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] private static extern bool EnumWindows(Callback c,IntPtr p);
 [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr h,Callback c,IntPtr p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsChild(IntPtr parent,IntPtr child);
 [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr h,StringBuilder t,int n);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern IntPtr SendMessageTimeout(IntPtr h,uint m,UIntPtr w,StringBuilder l,uint f,uint t,out UIntPtr r);
 [DllImport("user32.dll")] private static extern IntPtr SendMessageTimeout(IntPtr h,uint m,UIntPtr w,IntPtr l,uint f,uint t,out UIntPtr r);
 public static IntPtr[] Windows(){var a=new List<IntPtr>();EnumWindows((h,p)=>{a.Add(h);return true;},IntPtr.Zero);return a.ToArray();}
 public static IntPtr[] Children(IntPtr h){var a=new List<IntPtr>();EnumChildWindows(h,(w,p)=>{a.Add(w);return true;},IntPtr.Zero);return a.ToArray();}
 public static string ClassName(IntPtr h){var s=new StringBuilder(256);GetClassName(h,s,s.Capacity);return s.ToString();}
 public static string Text(IntPtr h){var s=new StringBuilder(8192);UIntPtr r;if(SendMessageTimeout(h,0xD,new UIntPtr((uint)s.Capacity),s,2,1000,out r)==IntPtr.Zero)throw new Exception("Owned text query timeout");return s.ToString();}
 public static void Click(IntPtr h){UIntPtr r;if(SendMessageTimeout(h,0xF5,UIntPtr.Zero,IntPtr.Zero,2,2000,out r)==IntPtr.Zero)throw new Exception("Owned BM_CLICK timeout");}
}
'@
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
function Assert-Owned([IntPtr]$Handle,[int]$Owner){
 [uint32]$observed=0
 [void][CloseDialog]::GetWindowThreadProcessId($Handle,[ref]$observed)
 if($observed -ne $Owner -or -not [CloseDialog]::IsWindow($Handle)){throw 'Native target ownership changed'}
}
function Assert-Process($Launch){
 $profile=[IO.Path]::GetFullPath([string]$Launch.detail.profile)
 $parent=[IO.Directory]::GetParent($profile)
 $temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
 if([IO.Path]::GetFileName($profile) -cne 'user-data' -or -not $parent.Name.StartsWith('fishmark-rf902-',[StringComparison]::Ordinal) -or
  -not [string]::Equals($parent.Parent.FullName.TrimEnd('\'),$temp,[StringComparison]::OrdinalIgnoreCase)){throw 'Profile outside immediate owned temp directory'}
 $proc=Get-Process -Id ([int]$Launch.detail.pid) -ErrorAction Stop
 $created=([DateTimeOffset]$proc.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()
 if(-not [string]::Equals($proc.Path,[string]$Launch.detail.argv[0],[StringComparison]::OrdinalIgnoreCase) -or
  $created -gt [long]$Launch.epochMs -or $created -lt [long]$Launch.epochMs-30000){throw 'Live PID executable/creation mismatch'}
 return @{pid=$proc.Id;createdEpochMs=$created;executable=$proc.Path;profile=$profile}
}
try{
 Save-Proof
 while([DateTimeOffset]::UtcNow -lt $deadline){
  $events=@()
  if(Test-Path -LiteralPath $TelemetryPath){
   $lines=@(Get-Content -LiteralPath $TelemetryPath)
   for($i=0;$i -lt $lines.Count;$i++){
    if([string]::IsNullOrWhiteSpace($lines[$i])){continue}
    try{$events+=($lines[$i]|ConvertFrom-Json)}catch{if($i -ne $lines.Count-1){throw}}
   }
  }
  $launches=@($events|Where-Object event -eq 'launch')
  if($launches.Count -gt 1){throw 'Telemetry contains multiple launches'}
  if($launches.Count -eq 0){Start-Sleep -Milliseconds 50;continue}
  $launch=$launches[0];$identity=Assert-Process $launch
  $prompts=@($events|Where-Object event -eq 'dialog:message-box')
  if($prompts.Count -lt $PromptIndex){Start-Sleep -Milliseconds 50;continue}
  $prompt=$prompts[$PromptIndex-1]
  if($prompt.detail.pid -ne $identity.pid -or $prompt.detail.options.title -cne 'Unsaved Changes' -or
   ($prompt.detail.options.buttons -join '|') -cne "Save|Don't Save|Cancel" -or
   $prompt.detail.options.detail -cne 'Do you want to save your changes before closing?'){throw 'Unexpected native prompt contract'}
  $candidates=@()
  foreach($window in [CloseDialog]::Windows()){
   [uint32]$owner=0;[void][CloseDialog]::GetWindowThreadProcessId($window,[ref]$owner)
   if($owner -ne $identity.pid -or -not [CloseDialog]::IsWindowVisible($window) -or [CloseDialog]::ClassName($window) -cne '#32770'){continue}
   Assert-Owned $window $identity.pid
   $children=@(foreach($child in [CloseDialog]::Children($window)){
    Assert-Owned $child $identity.pid
    @{hwnd=$child.ToInt64();className=[CloseDialog]::ClassName($child);text=[CloseDialog]::Text($child);id=[CloseDialog]::GetDlgCtrlID($child);visible=[CloseDialog]::IsWindowVisible($child);enabled=[CloseDialog]::IsWindowEnabled($child)}
   })
   $automation=[System.Windows.Automation.AutomationElement]::FromHandle($window)
   $elements=$automation.FindAll([System.Windows.Automation.TreeScope]::Subtree,[System.Windows.Automation.Condition]::TrueCondition)
   $nodes=@($elements | ForEach-Object {
    $item=$_.Current
    @{name=$item.Name;pid=$item.ProcessId;hwnd=$item.NativeWindowHandle;controlType=$item.ControlType.ProgrammaticName;automationId=$item.AutomationId;enabled=$item.IsEnabled;offscreen=$item.IsOffscreen}
   })
   $candidate=@{hwnd=$window.ToInt64();title=[CloseDialog]::Text($window);children=$children;automationNodes=$nodes}
   $proof.candidates=@($candidate);Save-Proof
   if($candidate.title -cne 'Unsaved Changes'){continue}
   $ownedText=@($nodes | Where-Object {$_.pid -eq $identity.pid -and -not $_.offscreen} | ForEach-Object name)
   if(-not ($ownedText -ccontains [string]$prompt.detail.options.message) -or -not ($ownedText -ccontains [string]$prompt.detail.options.detail)){continue}
   $body=$ownedText -join "`n"
   $buttons=@($children|Where-Object {$_.className -ceq 'Button' -and $_.visible -and $_.enabled -and $_.text.Replace('&','') -ceq $Choice})
   if($buttons.Count -ne 1){continue}
   $candidates+=@{window=$window;button=[IntPtr]$buttons[0].hwnd;children=$children;title=$candidate.title;body=$body;automationNodes=$nodes}
  }
  if($candidates.Count -gt 1){throw 'Ambiguous owned close dialogs'}
  if($candidates.Count -eq 0){Start-Sleep -Milliseconds 50;continue}
  $target=$candidates[0];[void](Assert-Process $launch)
  Assert-Owned $target.window $identity.pid;Assert-Owned $target.button $identity.pid
  if(-not [CloseDialog]::IsChild($target.window,$target.button) -or [CloseDialog]::ClassName($target.button) -cne 'Button' -or
   [CloseDialog]::Text($target.button).Replace('&','') -cne $Choice -or -not [CloseDialog]::IsWindowEnabled($target.button)){throw 'Button identity changed before click'}
  $proof.identity=$identity;$proof.prompt=$prompt;$proof.target=@{hwnd=$target.window.ToInt64();buttonHwnd=$target.button.ToInt64();buttonId=[CloseDialog]::GetDlgCtrlID($target.button);title=$target.title;body=$target.body;children=$target.children;automationNodes=$target.automationNodes}
  $proof.clickEpochMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();Save-Proof
  [CloseDialog]::Click($target.button)
  # Discovery can consume its budget inside a native/UIAutomation query. A
  # verified real click needs its own bounded asynchronous close observation.
  $closedDeadline=[DateTimeOffset]::UtcNow.AddSeconds(3)
  $proof.closeObservationDeadlineEpochMs=$closedDeadline.ToUnixTimeMilliseconds();Save-Proof
  while([CloseDialog]::IsWindow($target.window) -and [DateTimeOffset]::UtcNow -lt $closedDeadline){Start-Sleep -Milliseconds 25}
  if([CloseDialog]::IsWindow($target.window)){throw 'Owned prompt did not close'}
  $proof.status='passed';break
 }
 if($proof.status -ne 'passed'){throw 'Timed out waiting for the exact owned native close prompt/button'}
}catch{$proof.status='failed';$proof.error=$_.Exception.ToString()}
finally{$proof.finishedEpochMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();Save-Proof}
if($proof.status -eq 'passed'){exit 0}else{exit 1}
