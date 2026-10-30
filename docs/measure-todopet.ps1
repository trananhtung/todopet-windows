<#
.SYNOPSIS
  Measures TodoPet's CPU, GPU and memory (the app and its WebView2 processes), dwm.exe's GPU, and the power
  state Windows reports, over a period of time. See docs/checklist-frame-loop-windows.md.

.EXAMPLE
  .\measure-todopet.ps1 -Seconds 60 -Label "A1 idle"

.EXAMPLE
  .\measure-todopet.ps1 -Delay 15 -Seconds 120 -Label "B3 locked"   # 15 s to press Win+L

.NOTES
  Windows PowerShell 5.1 or PowerShell 7. No admin rights needed. Each run appends a row to the CSV.
#>
param(
  [int]$Seconds = 60,
  [int]$Delay = 0,
  [string]$Label = "",
  [string]$Csv = (Join-Path ([Environment]::GetFolderPath("Desktop")) "todopet-measurements.csv")
)

$ErrorActionPreference = "Stop"

if (-not ("TodoPetMeasure.Power" -as [type])) {
  Add-Type -Namespace TodoPetMeasure -Name Power -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)]
public struct SYSTEM_POWER_STATUS {
  public byte ACLineStatus;
  public byte BatteryFlag;
  public byte BatteryLifePercent;
  public byte SystemStatusFlag;
  public int BatteryLifeTime;
  public int BatteryFullLifeTime;
}
[DllImport("kernel32.dll")]
public static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS status);
'@
}

function Get-PowerState {
  $s = New-Object TodoPetMeasure.Power+SYSTEM_POWER_STATUS
  if (-not [TodoPetMeasure.Power]::GetSystemPowerStatus([ref]$s)) { return @{ OnBattery = "?"; SaverFlag = "?" } }
  # ACLineStatus: 0 battery, 1 plugged in, 255 unknown. SystemStatusFlag: 1 = battery saver on (what TodoPet reads).
  $onBattery = switch ($s.ACLineStatus) { 0 { "yes" } 1 { "no" } default { "?" } }
  @{ OnBattery = $onBattery; SaverFlag = $s.SystemStatusFlag }
}

# TodoPet and everything it started (msedgewebview2.exe: browser, renderer, GPU, utility processes).
function Get-TodoPetIds {
  $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name)
  $roots = @($all | Where-Object { $_.Name -match '^todopet\.exe$' })
  if ($roots.Count -eq 0) { throw "TodoPet is not running." }
  $ids = New-Object 'System.Collections.Generic.HashSet[int]'
  $queue = New-Object 'System.Collections.Generic.Queue[int]'
  foreach ($r in $roots) {
    [void]$ids.Add([int]$r.ProcessId)
    $queue.Enqueue([int]$r.ProcessId)
  }
  while ($queue.Count -gt 0) {
    $parent = $queue.Dequeue()
    foreach ($child in @($all | Where-Object { $_.ParentProcessId -eq $parent })) {
      if ($ids.Add([int]$child.ProcessId)) { $queue.Enqueue([int]$child.ProcessId) }
    }
  }
  , $ids
}

function Get-CpuSeconds($ids) {
  $total = 0.0
  foreach ($id in $ids) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p -and $p.TotalProcessorTime) { $total += $p.TotalProcessorTime.TotalSeconds }
  }
  $total
}

function Get-MemoryMB($ids) {
  $ws = 0.0
  $private = 0.0
  foreach ($id in $ids) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p) {
      $ws += $p.WorkingSet64
      $private += $p.PrivateMemorySize64
    }
  }
  @{ WorkingSet = [math]::Round($ws / 1MB, 1); Private = [math]::Round($private / 1MB, 1) }
}

# Sum of the 3D engine utilization of these processes, from one set of GPU Engine counter samples.
function Get-Gpu3D($sample, $ids) {
  $sum = 0.0
  foreach ($c in $sample.CounterSamples) {
    if ($c.InstanceName -match '^pid_(\d+)_.*engtype_3d$' -and $ids.Contains([int]$Matches[1])) { $sum += $c.CookedValue }
  }
  $sum
}

if ($Delay -gt 0) {
  Write-Host "Starting in $Delay s ($Label)..."
  Start-Sleep -Seconds $Delay
}

$ids = Get-TodoPetIds
$dwm = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($p in @(Get-Process dwm -ErrorAction SilentlyContinue)) { [void]$dwm.Add($p.Id) }
$cores = [Environment]::ProcessorCount
$powerBefore = Get-PowerState

$cpu0 = Get-CpuSeconds $ids
$wall0 = Get-Date
$memPeak = @{ WorkingSet = 0.0; Private = 0.0 }
$gpu = New-Object 'System.Collections.Generic.List[double]'
$dwmGpu = New-Object 'System.Collections.Generic.List[double]'

# One GPU sample a second; memory is read alongside so its peak is known too.
for ($i = 0; $i -lt $Seconds; $i++) {
  try {
    $sample = Get-Counter -Counter "\GPU Engine(*)\Utilization Percentage" -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop
    $gpu.Add((Get-Gpu3D $sample $ids))
    $dwmGpu.Add((Get-Gpu3D $sample $dwm))
  } catch {
    Start-Sleep -Seconds 1
  }
  $mem = Get-MemoryMB $ids
  if ($mem.WorkingSet -gt $memPeak.WorkingSet) { $memPeak.WorkingSet = $mem.WorkingSet }
  if ($mem.Private -gt $memPeak.Private) { $memPeak.Private = $mem.Private }
}

$cpu1 = Get-CpuSeconds $ids
$elapsed = ((Get-Date) - $wall0).TotalSeconds
$powerAfter = Get-PowerState
$avg = { param($list) if ($list.Count -gt 0) { [math]::Round(($list | Measure-Object -Average).Average, 2) } else { "n/a" } }

$row = [pscustomobject]@{
  Time          = $wall0.ToString("yyyy-MM-dd HH:mm:ss")
  Label         = $Label
  Seconds       = [math]::Round($elapsed, 1)
  CpuPctMachine = [math]::Round(($cpu1 - $cpu0) / ($elapsed * $cores) * 100, 3)
  CpuPctOneCore = [math]::Round(($cpu1 - $cpu0) / $elapsed * 100, 2)
  Gpu3DPct      = & $avg $gpu
  DwmGpu3DPct   = & $avg $dwmGpu
  WorkingSetMB  = $memPeak.WorkingSet
  PrivateMB     = $memPeak.Private
  Processes     = $ids.Count
  OnBattery     = $powerAfter.OnBattery
  SaverFlag     = "$($powerBefore.SaverFlag)->$($powerAfter.SaverFlag)"
  Cores         = $cores
  Windows       = [Environment]::OSVersion.Version.ToString()
}

$row | Format-List
$row | Export-Csv -Path $Csv -Append -NoTypeInformation -Encoding UTF8
Write-Host "Appended to $Csv"
