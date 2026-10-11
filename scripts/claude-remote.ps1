# One native Claude Remote Control server per repository. No resident wrapper.
[CmdletBinding()]
param(
    [ValidateSet('ensure', 'status', 'stop', 'relay')][string]$Action = 'ensure',
    [string]$Executable, [string]$RepoRoot, [string]$StateDir
)

$ErrorActionPreference = 'Stop'

function Get-RemoteProcess($StateFile) {
    if (-not (Test-Path -LiteralPath $StateFile)) { return $null }
    try {
        $state = [IO.File]::ReadAllText($StateFile) | ConvertFrom-Json
        $server = Get-Process -Id $state.pid -ErrorAction Stop
        if ($server.StartTime.ToUniversalTime().Ticks.ToString() -ne $state.started) { return $null }
        return $server
    } catch { return $null }
}

function Write-RemoteStatus($Server, $Message) {
    $Server.Refresh()
    $working = [math]::Round($Server.WorkingSet64 / 1MB, 1)
    $private = [math]::Round($Server.PrivateMemorySize64 / 1MB, 1)
    Write-Output ("Remote Control {0} (PID {1}): {2} MiB working set, {3} MiB private. Phone connection not verified." -f
        $Message, $Server.Id, $working, $private)
}

function Start-RemoteProcess($Executable, $RepoRoot, $StateDir) {
    # Explicit ShellExecute isolates the short-lived relay from all command-tool handles.
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = 'powershell.exe'
    $info.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" relay -Executable "{1}" -RepoRoot "{2}" -StateDir "{3}"' -f
        $PSCommandPath, $Executable, $RepoRoot, $StateDir
    $info.UseShellExecute = $true
    $info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $relay = [Diagnostics.Process]::Start($info)
    if (-not $relay.WaitForExit(10000)) { $relay.Kill(); throw 'Remote Control launcher timed out.' }
    $server = Get-RemoteProcess (Join-Path $StateDir 'server.json')
    if (-not $server) {
        $failure = Get-RemoteFailure $StateDir $true
        if ($failure) { throw $failure }
        throw 'Remote Control exited during launch. Inspect the local stdout.log, stderr.log and launch-error.txt.'
    }
    return $server
}

function Invoke-RemoteRelay($Executable, $RepoRoot, $StateDir) {
    $server = $null
    try {
        $launcher = Join-Path (Split-Path -Parent $PSCommandPath) 'claude-remote-launch.mjs'
        & node $launcher $Executable $RepoRoot $StateDir
        if ($LASTEXITCODE -ne 0) { throw 'Native server launch failed.' }
        $receipt = [IO.File]::ReadAllText((Join-Path $StateDir 'launched.json')) | ConvertFrom-Json
        $server = Get-Process -Id $receipt.pid -ErrorAction Stop
        $record = @{
            pid = $server.Id
            started = $server.StartTime.ToUniversalTime().Ticks.ToString()
            executable = $Executable
        }
        [IO.File]::WriteAllText((Join-Path $StateDir 'server.json'), ($record | ConvertTo-Json))
    } catch {
        if ($server -and -not $server.HasExited) { $server.Kill() }
        [IO.File]::WriteAllText((Join-Path $StateDir 'launch-error.txt'), $_.Exception.Message)
        exit 1
    }
}

function Read-RemoteLog($StateDir) {
    $parts = foreach ($name in @('stdout.log', 'stderr.log')) {
        $file = Join-Path $StateDir $name
        if (Test-Path -LiteralPath $file) {
            # Logs may contain session URLs. Keep them local; never dump them into a PR.
            Get-Content -LiteralPath $file -Tail 30
        }
    }
    return ($parts -join "`n")
}

function Get-RemoteFailure($StateDir, [bool]$Startup = $false) {
    $log = Read-RemoteLog $StateDir
    if ($log -match 'must be logged in|not logged in|claude auth login') {
        return 'Claude CLI is not signed in. Run claude auth login in a laptop terminal, then /start again.'
    }
    if ($log -match 'Enable Remote Control\?|Workspace not trusted|Trust .+\[y/N\]') {
        return 'First-time setup required. Run claude remote-control --spawn worktree --no-create-session-in-dir --capacity 4 interactively, complete its consent/trust prompts, stop it with Ctrl+C, then run /start again.'
    }
    if ($log -match 'This folder is already served') {
        return 'Claude rejected Remote Control: this folder is already served. Stop any manually started server, allow its registration a few minutes to expire, then retry /start.'
    }
    if ($Startup -and $log -match '(?m)^Error:') {
        return 'Claude reported a Remote Control error. Inspect the local stdout.log and stderr.log, then retry /start.'
    }
}

function Invoke-ClaudeRemote($Mode, $RepoRoot, $StateDir) {
    [IO.Directory]::CreateDirectory($StateDir) | Out-Null
    $hash = [Security.Cryptography.SHA256]::Create()
    try {
        $key = [BitConverter]::ToString($hash.ComputeHash(
            [Text.Encoding]::UTF8.GetBytes($StateDir.ToLowerInvariant()))).Replace('-', '')
    } finally { $hash.Dispose() }
    $mutex = [Threading.Mutex]::new($false, "Local\NoaCGClaudeRemote-$key")
    $held = $false
    $stateFile = Join-Path $StateDir 'server.json'
    try {
        try { $held = $mutex.WaitOne(20000) }
        catch [Threading.AbandonedMutexException] { $held = $true }
        if (-not $held) { throw 'Another /start is preparing Remote Control. Retry shortly.' }
        $server = Get-RemoteProcess $stateFile
        if ($Mode -eq 'stop') {
            if ($server) {
                $server.Kill()
                $server.WaitForExit(5000) | Out-Null
                if (-not $server.HasExited) { throw 'Remote Control did not stop.' }
            }
            Remove-Item -LiteralPath $stateFile -ErrorAction SilentlyContinue
            Write-Output 'Managed Remote Control server stopped.'
            return
        }
        if ($server) {
            $failure = Get-RemoteFailure $StateDir
            if ($failure) {
                $server.Kill()
                $server.WaitForExit(5000) | Out-Null
                Remove-Item -LiteralPath $stateFile -ErrorAction SilentlyContinue
                throw $failure
            }
            Write-RemoteStatus $server 'already running'
            return
        }
        if ($Mode -eq 'status') { Write-Output 'Managed Remote Control server is not running.'; return }

        $cli = Get-Command claude.exe -CommandType Application -ErrorAction SilentlyContinue
        if (-not $cli) { throw 'Claude CLI missing. Install Claude Code CLI on this laptop, then run /start again.' }
        $server = $null
        try {
            $server = Start-RemoteProcess $cli.Source $RepoRoot $StateDir
            # Bounded startup check, not a persistent monitor.
            for ($attempt = 0; $attempt -lt 10; $attempt++) {
                Start-Sleep -Milliseconds 500
                $server.Refresh()
                $failure = Get-RemoteFailure $StateDir $true
                if ($failure) { throw $failure }
                if ($server.HasExited) {
                    throw ("Remote Control exited ({0}). Inspect the local stdout.log and stderr.log in {1}; complete any CLI setup in a laptop terminal, then retry /start." -f $server.ExitCode, $StateDir)
                }
            }
            Write-RemoteStatus $server 'running'
        } catch {
            # Only the exact process we just started, never an unrelated Claude session.
            $owned = Get-RemoteProcess $stateFile
            if ($owned) { $owned.Kill(); $owned.WaitForExit(5000) | Out-Null }
            Remove-Item -LiteralPath $stateFile -ErrorAction SilentlyContinue
            throw
        }
    } finally {
        if ($held) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

# Dot-sourcing exposes the functions for process-lifecycle tests without starting Claude.
if ($MyInvocation.InvocationName -ne '.') {
    try {
        if ($Action -eq 'relay') { Invoke-RemoteRelay $Executable $RepoRoot $StateDir; exit 0 }
        $common = & git rev-parse --path-format=absolute --git-common-dir
        if ($LASTEXITCODE -ne 0) { throw 'Run this command inside the NoaCG Git repository.' }
        $common = [IO.Path]::GetFullPath(($common | Select-Object -Last 1).Trim())
        # Linked worktrees share the primary repository and this one server record.
        $repo = Split-Path -Parent $common
        Invoke-ClaudeRemote $Action $repo (Join-Path $common 'noacg-claude-remote')
    } catch {
        [Console]::Error.WriteLine($_.Exception.Message)
        exit 1
    }
}
