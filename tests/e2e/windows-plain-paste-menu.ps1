param([Parameter(Mandatory)][string]$TelemetryPath,[Parameter(Mandatory)][string]$OutputPath,[Parameter(Mandatory)][long]$WindowHandle,[Parameter(Mandatory)][int]$OwnerPid)
$ErrorActionPreference='Stop'
$proof=[ordered]@{status='running';startedEpochMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();ownerPid=$OwnerPid;hwnd=$WindowHandle}
function Save-Proof {$proof|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $OutputPath -Encoding utf8}
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class PlainPasteMenu {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
}
'@
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
try {
 Save-Proof
 $launch=Get-Content -LiteralPath $TelemetryPath -TotalCount 1|ConvertFrom-Json
 if($launch.event -ne 'launch' -or $launch.detail.pid -ne $OwnerPid){throw 'Unexpected owned launch'}
 $ownedProfile=[IO.Path]::GetFullPath([string]$launch.detail.profile)
 $parent=[IO.Directory]::GetParent($ownedProfile)
 if([IO.Path]::GetFileName($ownedProfile) -cne 'user-data' -or -not $parent.Name.StartsWith('fishmark-rf902-',[StringComparison]::Ordinal) -or
  -not [string]::Equals($parent.Parent.FullName.TrimEnd('\'),[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Not an owned isolated profile'}
 $process=Get-Process -Id $OwnerPid -ErrorAction Stop
 $created=([DateTimeOffset]$process.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()
 if(-not [string]::Equals($process.Path,[string]$launch.detail.argv[0],[StringComparison]::OrdinalIgnoreCase) -or $created -gt $launch.epochMs -or $created -lt $launch.epochMs-30000){throw 'Owned process identity changed'}
 $proof.identity=@{pid=$OwnerPid;createdEpochMs=$created;executable=$process.Path;profile=$ownedProfile}
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(25)
 $condition=[Windows.Automation.AndCondition]::new(
  [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty,$OwnerPid),
  [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::MenuItem),
  [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty,'仅粘贴文本 Ctrl+Shift+V'))
 $ownedMenuCondition=[Windows.Automation.AndCondition]::new(
  [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ProcessIdProperty,$OwnerPid),
  [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::MenuItem))
 while([DateTimeOffset]::UtcNow -lt $deadline){
  [uint32]$observed=0
  [void][PlainPasteMenu]::GetWindowThreadProcessId([IntPtr]$WindowHandle,[ref]$observed)
  if($observed -ne $OwnerPid -or -not [PlainPasteMenu]::IsWindow([IntPtr]$WindowHandle)){throw 'Owned window disappeared'}
  $items=[Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Descendants,$condition)
  if($items.Count -gt 1){throw 'Ambiguous native paste menu'}
  if($items.Count -eq 0){
   $visibleItems=[Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Descendants,$ownedMenuCondition)
   $proof.ownedMenuNames=@($visibleItems|Select-Object -First 64|ForEach-Object {$_.Current.Name})
   Start-Sleep -Milliseconds 50;continue
  }
  if([PlainPasteMenu]::GetForegroundWindow() -ne [IntPtr]$WindowHandle){throw 'Native menu foreground changed'}
  $item=$items[0]
  if($item.Current.ProcessId -ne $OwnerPid -or -not $item.Current.IsEnabled){throw 'Menu item is not enabled and owned'}
  $invoke=$null
  if(-not $item.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern,[ref]$invoke)){throw 'Native menu does not support InvokePattern'}
  $proof.item=@{name=$item.Current.Name;processId=$item.Current.ProcessId;accelerator=$item.Current.AcceleratorKey;pattern='UIAutomation InvokePattern';matches=$items.Count}
  $proof.invokedEpochMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();Save-Proof
  ([Windows.Automation.InvokePattern]$invoke).Invoke()
  $proof.status='passed';$proof.finishedEpochMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();Save-Proof
  exit 0
 }
 throw 'Owned plain-text menu item was not found'
} catch {$proof.status='failed';$proof.error=$_.Exception.Message;Save-Proof;throw}
