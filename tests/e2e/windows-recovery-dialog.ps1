param(
  [Parameter(Mandatory = $true)][string]$TelemetryPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [ValidateRange(1, 120)][int]$TimeoutSeconds = 30,
  [ValidateRange(1, 20)][int]$ExpectedCount = 1
)
$ErrorActionPreference = 'Stop'
$started = [DateTimeOffset]::UtcNow
$deadline = $started.AddSeconds($TimeoutSeconds)
$evidence = [ordered]@{
  method = 'Owned recovery dialog observation; verified IDOK BM_CLICK or UIAutomation InvokePattern'
  telemetryPath = [IO.Path]::GetFullPath($TelemetryPath)
  outputPath = [IO.Path]::GetFullPath($OutputPath)
  expectedCount = $ExpectedCount
  timeoutSeconds = $TimeoutSeconds
  startedEpochMs = $started.ToUnixTimeMilliseconds()
  status = 'running'
  exitCode = 1
  launch = $null
  dialogs = [Collections.Generic.List[object]]::new()
  candidates = [Collections.Generic.List[object]]::new()
}
$candidateFingerprints = [Collections.Generic.HashSet[string]]::new()
function Save-Evidence {
  $parentDirectory = [IO.Path]::GetDirectoryName($evidence.outputPath)
  [void][IO.Directory]::CreateDirectory($parentDirectory)
  $evidence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $evidence.outputPath -Encoding utf8
}
function Read-Telemetry {
  if (-not (Test-Path -LiteralPath $evidence.telemetryPath)) { return @() }
  $lines = @(Get-Content -LiteralPath $evidence.telemetryPath)
  $records = [Collections.Generic.List[object]]::new()
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ([string]::IsNullOrWhiteSpace($lines[$index])) { continue }
    try { $records.Add(($lines[$index] | ConvertFrom-Json)) }
    catch { if ($index -ne $lines.Count - 1) { throw }; break }
  }
  return $records.ToArray()
}
function Initialize-NativeDialogApi {
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class RF902RecoveryDialog {
 public delegate bool Callback(IntPtr window, IntPtr parameter);
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left,top,right,bottom; }
 [DllImport("user32.dll")] private static extern bool EnumWindows(Callback callback,IntPtr parameter);
 [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent,Callback callback,IntPtr parameter);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr window,int id);
 [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr window);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window,out RECT rect);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr window,StringBuilder text,int length);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern IntPtr SendMessageTimeout(IntPtr window,uint message,UIntPtr wParam,StringBuilder lParam,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll")] private static extern IntPtr SendMessageTimeout(IntPtr window,uint message,UIntPtr wParam,IntPtr lParam,uint flags,uint timeout,out UIntPtr result);
 public static IntPtr[] Windows() { var result=new List<IntPtr>(); EnumWindows((w,p)=>{result.Add(w);return true;},IntPtr.Zero); return result.ToArray(); }
 public static IntPtr[] Children(IntPtr parent) { var result=new List<IntPtr>(); EnumChildWindows(parent,(w,p)=>{result.Add(w);return true;},IntPtr.Zero); return result.ToArray(); }
 public static string ClassName(IntPtr window) { var text=new StringBuilder(256); GetClassName(window,text,text.Capacity); return text.ToString(); }
 public static string Text(IntPtr window) { var text=new StringBuilder(8192); UIntPtr result; if(SendMessageTimeout(window,0x000D,new UIntPtr((uint)text.Capacity),text,2,1000,out result)==IntPtr.Zero) throw new Exception("Owned dialog text query failed or timed out."); return text.ToString(); }
 public static void ClickOk(IntPtr button) { UIntPtr result; if(SendMessageTimeout(button,0x00F5,UIntPtr.Zero,IntPtr.Zero,2,2000,out result)==IntPtr.Zero) throw new Exception("Owned dialog BM_CLICK failed or timed out."); }
 public static void InvokeButton(object pattern) { var task=System.Threading.Tasks.Task.Run(()=>pattern.GetType().GetMethod("Invoke").Invoke(pattern,null)); if(!task.Wait(2000)) throw new Exception("Owned UIAutomation InvokePattern timed out."); task.GetAwaiter().GetResult(); }
}
'@
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
}
function Read-AutomationTree([IntPtr]$Handle) {
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($Handle)
  $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Subtree, [System.Windows.Automation.Condition]::TrueCondition)
  $nodes = @($elements | ForEach-Object {
    $current = $_.Current
    @{ name = $current.Name; automationId = $current.AutomationId; className = $current.ClassName
      controlType = $current.ControlType.ProgrammaticName; pid = $current.ProcessId; hwnd = $current.NativeWindowHandle
      enabled = $current.IsEnabled; offscreen = $current.IsOffscreen }
  })
  return @{ nodes = $nodes; elements = $elements }
}
function Assert-Owner([IntPtr]$Handle, [int]$OwnerPid) {
  [uint32]$observedOwner = 0
  [void][RF902RecoveryDialog]::GetWindowThreadProcessId($Handle, [ref]$observedOwner)
  if ($observedOwner -ne $OwnerPid) { throw 'Dialog or button ownership changed.' }
}
function Get-OwnedProcess($Launch) {
  $profile = [IO.Path]::GetFullPath([string]$Launch.detail.profile)
  $profileParent = [IO.Directory]::GetParent($profile)
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if ([IO.Path]::GetFileName($profile) -ne 'user-data' -or $null -eq $profileParent -or
      -not $profileParent.Name.StartsWith('fishmark-rf902-', [StringComparison]::Ordinal) -or
      -not $profile.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Launch profile is outside the isolated RF902 temporary profile.'
  }
  $ownerProcess = Get-Process -Id ([int]$Launch.detail.pid) -ErrorAction Stop
  $actualExecutable = [IO.Path]::GetFullPath($ownerProcess.Path)
  $launchExecutable = [IO.Path]::GetFullPath([string]$Launch.detail.argv[0])
  $creationEpochMs = ([DateTimeOffset]$ownerProcess.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()
  if (-not [string]::Equals($actualExecutable, $launchExecutable, [StringComparison]::OrdinalIgnoreCase) -or
      $creationEpochMs -gt [long]$Launch.epochMs -or $creationEpochMs -lt ([long]$Launch.epochMs - 30000)) {
    throw 'Live process executable or creation time does not match telemetry launch identity.'
  }
  return @{ pid = $ownerProcess.Id; executable = $actualExecutable; creationEpochMs = $creationEpochMs; profile = $profile; launchEpochMs = $Launch.epochMs }
}
try {
  Save-Evidence
  Initialize-NativeDialogApi
  while ($evidence.dialogs.Count -lt $ExpectedCount -and [DateTimeOffset]::UtcNow -lt $deadline) {
    $records = @(Read-Telemetry)
    $launches = @($records | Where-Object { $_.event -eq 'launch' })
    if ($launches.Count -gt 1) { throw 'Expected one product launch in the telemetry file.' }
    if ($launches.Count -eq 0) { Start-Sleep -Milliseconds 50; continue }
    $launch = $launches[0]
    $ownedIdentity = Get-OwnedProcess $launch
    if ($null -eq $evidence.launch) { $evidence.launch = $ownedIdentity; Save-Evidence }
    $ownedWindows = @([RF902RecoveryDialog]::Windows() | Where-Object {
      [uint32]$candidateOwner = 0
      [void][RF902RecoveryDialog]::GetWindowThreadProcessId($_, [ref]$candidateOwner)
      $candidateOwner -eq $ownedIdentity.pid -and [RF902RecoveryDialog]::IsWindowVisible($_)
    })
    $automationTrees = @{}
    foreach ($candidate in $ownedWindows) {
      $observation = [ordered]@{ pid = $ownedIdentity.pid; hwnd = $candidate.ToInt64(); className = [RF902RecoveryDialog]::ClassName($candidate) }
      try {
        $observation.title = [RF902RecoveryDialog]::Text($candidate)
        $observation.children = @([RF902RecoveryDialog]::Children($candidate) | ForEach-Object {
          Assert-Owner $_ $ownedIdentity.pid
          @{ hwnd = $_.ToInt64(); className = [RF902RecoveryDialog]::ClassName($_); controlId = [RF902RecoveryDialog]::GetDlgCtrlID($_); text = [RF902RecoveryDialog]::Text($_) }
        })
        if ($observation.className -ceq '#32770') {
          $automationTree = Read-AutomationTree $candidate
          $observation.automationNodes = $automationTree.nodes
          $automationTrees[$candidate.ToInt64()] = $automationTree
        }
      } catch { $observation.observationError = $_.Exception.ToString() }
      $fingerprint = $observation | ConvertTo-Json -Depth 8 -Compress
      if ($candidateFingerprints.Add($fingerprint)) {
        $observation.observedEpochMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $evidence.candidates.Add($observation)
        Save-Evidence
      }
    }
    $dialogs = @($records | Where-Object { $_.event -eq 'dialog:error-box' })
    if ($dialogs.Count -gt $ExpectedCount) { throw 'Product emitted more recovery dialogs than expected.' }
    if ($dialogs.Count -le $evidence.dialogs.Count) { Start-Sleep -Milliseconds 50; continue }
    $expected = $dialogs[$evidence.dialogs.Count]
    if ([int]$expected.detail.pid -ne $ownedIdentity.pid -or [long]$expected.epochMs -lt [long]$launch.epochMs) {
      throw 'Recovery dialog event does not belong to the telemetry launch.'
    }
    $expectedTitle = [string]$expected.detail.title
    if ($expectedTitle -cne 'Recovery incomplete' -and $expectedTitle -cne 'Recovery unavailable') {
      throw 'Unexpected recovery dialog title; refusing to interact.'
    }
    $expectedContent = ([string]$expected.detail.content).Replace("`r`n", "`n")
    $matches = @($ownedWindows | Where-Object {
      $nativeTitle = [RF902RecoveryDialog]::Text($_)
      $tree = $automationTrees[$_.ToInt64()]
      $hasTitle = $null -ne $tree -and @($tree.nodes | Where-Object { $_.pid -eq $ownedIdentity.pid -and $_.name -ceq $expectedTitle }).Count -gt 0
      $hasContent = $null -ne $tree -and @($tree.nodes | Where-Object { $_.pid -eq $ownedIdentity.pid -and $_.name.Replace("`r`n", "`n") -ceq $expectedContent }).Count -gt 0
      [RF902RecoveryDialog]::ClassName($_) -ceq '#32770' -and
      ($nativeTitle -ceq $expectedTitle -or ($nativeTitle -ceq 'Error' -and $hasTitle -and $hasContent))
    })
    if ($matches.Count -gt 1) { throw 'Ambiguous owned recovery dialogs.' }
    if ($matches.Count -eq 0) { Start-Sleep -Milliseconds 50; continue }
    $dialogHandle = [IntPtr]$matches[0]
    Assert-Owner $dialogHandle $ownedIdentity.pid
    $children = @([RF902RecoveryDialog]::Children($dialogHandle) | ForEach-Object {
      Assert-Owner $_ $ownedIdentity.pid
      @{ hwnd = $_.ToInt64(); className = [RF902RecoveryDialog]::ClassName($_); controlId = [RF902RecoveryDialog]::GetDlgCtrlID($_); text = [RF902RecoveryDialog]::Text($_) }
    })
    $uiaTree = Read-AutomationTree $dialogHandle
    $invokePattern = $null
    $action = 'BM_CLICK'
    if ([RF902RecoveryDialog]::Text($dialogHandle) -ceq 'Error') {
      if (-not @($uiaTree.nodes | Where-Object { $_.pid -eq $ownedIdentity.pid -and $_.name -ceq $expectedTitle }).Count -or
          -not @($uiaTree.nodes | Where-Object { $_.pid -eq $ownedIdentity.pid -and $_.name.Replace("`r`n", "`n") -ceq $expectedContent }).Count) {
        throw 'UIAutomation title and complete body no longer match the recorded recovery error.'
      }
      $buttonIndices = @(for ($index = 0; $index -lt $uiaTree.nodes.Count; $index++) {
        if ($uiaTree.nodes[$index].controlType -ceq 'ControlType.Button' -or
            ($uiaTree.nodes[$index].controlType -ceq 'ControlType.Pane' -and $uiaTree.nodes[$index].automationId -ceq 'CommandButton_1')) { $index }
      })
      if ($buttonIndices.Count -ne 1) { throw 'Owned TaskDialog does not expose exactly one UIAutomation Button.' }
      $buttonNode = $uiaTree.nodes[$buttonIndices[0]]
      if ($buttonNode.pid -ne $ownedIdentity.pid -or -not $buttonNode.enabled -or $buttonNode.offscreen) { throw 'UIAutomation button is not visible, enabled, and owned.' }
      $okButton = [IntPtr]$buttonNode.hwnd
      if ($buttonNode.controlType -ceq 'ControlType.Button') {
        $invokePattern = $uiaTree.elements[$buttonIndices[0]].GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $action = 'UIAutomation InvokePattern'
      } else {
        $action = 'BM_CLICK verified TaskDialog'
      }
    } else {
      if (-not @($children | Where-Object { $_.className -ceq 'Static' -and $_.text.Replace("`r`n", "`n") -ceq $expectedContent }).Count) {
        throw 'Owned dialog text does not match the recorded recovery error.'
      }
      $okButton = [RF902RecoveryDialog]::GetDlgItem($dialogHandle, 1)
    }
    Assert-Owner $okButton $ownedIdentity.pid
    if ($okButton -eq [IntPtr]::Zero -or [RF902RecoveryDialog]::ClassName($okButton) -cne 'Button' -or
        -not [RF902RecoveryDialog]::IsWindowVisible($okButton) -or -not [RF902RecoveryDialog]::IsWindowEnabled($okButton)) {
      throw 'Owned recovery dialog has no visible enabled native Button.'
    }
    $rectangle = New-Object RF902RecoveryDialog+RECT
    if (-not [RF902RecoveryDialog]::GetWindowRect($dialogHandle, [ref]$rectangle)) { throw 'Could not capture owned dialog geometry.' }
    $entry = [ordered]@{ event = $expected; pid = $ownedIdentity.pid; hwnd = $dialogHandle.ToInt64(); title = [RF902RecoveryDialog]::Text($dialogHandle); children = $children
      rectangle = @{ left = $rectangle.left; top = $rectangle.top; right = $rectangle.right; bottom = $rectangle.bottom }
      automationNodes = $uiaTree.nodes
      observedEpochMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); buttonHwnd = $okButton.ToInt64(); buttonId = [RF902RecoveryDialog]::GetDlgCtrlID($okButton); action = $action; completed = $false }
    $evidence.dialogs.Add($entry)
    Save-Evidence
    if ([DateTimeOffset]::UtcNow -ge $deadline) { throw 'Timeout before owned recovery dialog click.' }
    [void](Get-OwnedProcess $launch)
    Assert-Owner $dialogHandle $ownedIdentity.pid
    Assert-Owner $okButton $ownedIdentity.pid
    $entry.clickRequestedEpochMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if ($null -ne $invokePattern) { [RF902RecoveryDialog]::InvokeButton($invokePattern) }
    else { [RF902RecoveryDialog]::ClickOk($okButton) }
    while ([RF902RecoveryDialog]::IsWindow($dialogHandle) -and [DateTimeOffset]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 25 }
    if ([RF902RecoveryDialog]::IsWindow($dialogHandle)) { throw 'Owned dialog did not close after BM_CLICK.' }
    $entry.closedEpochMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $entry.completed = $true
    Save-Evidence
  }
  if ($evidence.dialogs.Count -ne $ExpectedCount) { throw 'Timed out waiting for expected owned recovery dialogs.' }
  $evidence.status = 'passed'
  $evidence.exitCode = 0
} catch {
  $evidence.status = 'failed'
  $evidence.error = $_.Exception.ToString()
} finally {
  $evidence.finishedEpochMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  Save-Evidence
}
exit $evidence.exitCode
