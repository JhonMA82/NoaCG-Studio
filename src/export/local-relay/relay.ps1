# NoaCG local relay v1 (Windows) -- double-click "Start controller.cmd" instead of running
# this directly. Serves this package's files over http://localhost:<port>/ and relays control
# commands between the control panel and the graphics through a tiny ordered log, so a panel
# in your browser can drive a graphic loaded in OBS/vMix (separate browser engines that a
# BroadcastChannel can never cross). Windows PowerShell 5.1, standard library only.
#
# Protocol v1 (shared with relay.py -- keep them in agreement):
#   GET  /relay/ping           -> {"ok":true,"v":1,"head":N}
#   GET  /relay/head           -> {"head":N}
#   GET  /relay/log?after=N    -> {"rows":[{"id","graphic","stream","msg"}...],"head":N} (max 500)
#   POST /relay/send           -> body {"graphic","msg","stream"?} or {"items":[...]} -> {"head":N}
#   anything else              -> a file from this folder (the package is the web root)
# Rows persist to relay-log.jsonl beside this script, so a relay restart keeps the history.

param([int]$Port = 8787)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $root 'relay-log.jsonl'

$rows = New-Object System.Collections.ArrayList
$script:head = 0
if (Test-Path $logFile) {
  foreach ($line in Get-Content $logFile) {
    if ($line.Trim().Length -gt 0) {
      try {
        $row = $line | ConvertFrom-Json
        [void]$rows.Add($row)
        if ($row.id -gt $script:head) { $script:head = $row.id }
      } catch { }
    }
  }
}

$listener = $null
for ($p = $Port; $p -lt ($Port + 40); $p++) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    $l.Start()
    $listener = $l
    $Port = $p
    break
  } catch { }
}
if ($null -eq $listener) { Write-Host 'No free port between 8787 and 8826.'; exit 1 }

Write-Host "NoaCG local relay v1 -- http://localhost:$Port/"
Write-Host 'Point OBS/vMix browser sources at the graphics on this address; keep this window open.'
Write-Host 'Ctrl+C stops it.'

# Open the operator page: the production CONTROLLER when the package has one, else the
# aggregated show panel, else the single graphic's panel.
$panel = 'controlpanel.html'
if (Test-Path (Join-Path $root 'show_controlpanel.html')) { $panel = 'show_controlpanel.html' }
if (Test-Path (Join-Path $root 'controller.html')) { $panel = 'controller.html' }
if (Test-Path (Join-Path $root $panel)) { Start-Process "http://localhost:$Port/$panel" }

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.js' = 'application/javascript; charset=utf-8'; '.mjs' = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.gif' = 'image/gif'
  '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'; '.avif' = 'image/avif'
  '.woff2' = 'font/woff2'; '.woff' = 'font/woff'; '.ttf' = 'font/ttf'; '.otf' = 'font/otf'
  '.webm' = 'video/webm'; '.mp4' = 'video/mp4'; '.txt' = 'text/plain; charset=utf-8'
}

function Send-Json($ctx, $obj, $status) {
  if ($null -eq $status) { $status = 200 }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 12 -Compress))
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = 'application/json; charset=utf-8'
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}

function Append-Row($item) {
  $script:head = $script:head + 1
  $stream = 'program'
  if ($item.PSObject.Properties['stream'] -and $item.stream) { $stream = [string]$item.stream }
  $row = [pscustomobject]@{ id = $script:head; graphic = [string]$item.graphic; stream = $stream; msg = $item.msg }
  [void]$rows.Add($row)
  Add-Content -Path $logFile -Value ($row | ConvertTo-Json -Depth 12 -Compress) -Encoding utf8
  return $row
}

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  try {
    $path = $ctx.Request.Url.AbsolutePath
    if ($path -eq '/relay/ping') {
      Send-Json $ctx @{ ok = $true; v = 1; head = $script:head }
    } elseif ($path -eq '/relay/head') {
      Send-Json $ctx @{ head = $script:head }
    } elseif ($path -eq '/relay/log') {
      $after = 0
      $q = $ctx.Request.QueryString['after']
      if ($q) { $after = [int]$q }
      $out = @($rows | Where-Object { $_.id -gt $after } | Select-Object -First 500)
      Send-Json $ctx @{ rows = $out; head = $script:head }
    } elseif ($path -eq '/relay/send' -and $ctx.Request.HttpMethod -eq 'POST') {
      $body = [IO.StreamReader]::new($ctx.Request.InputStream, [Text.Encoding]::UTF8).ReadToEnd()
      $parsed = $body | ConvertFrom-Json
      $items = @($parsed)
      if ($parsed.PSObject.Properties['items']) { $items = @($parsed.items) }
      foreach ($item in $items) { [void](Append-Row $item) }
      Send-Json $ctx @{ head = $script:head }
    } else {
      # Static: this folder is the web root. Resolve inside it only (no .. escapes).
      $rel = $path.TrimStart('/')
      if ($rel -eq '') { $rel = $panel }
      $full = [IO.Path]::GetFullPath((Join-Path $root ($rel -replace '/', '\')))
      $rootFull = [IO.Path]::GetFullPath($root)
      if (-not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $full -PathType Leaf)) {
        Send-Json $ctx @{ error = 'not found' } 404
      } else {
        $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
        $ct = $types[$ext]
        if (-not $ct) { $ct = 'application/octet-stream' }
        $bytes = [IO.File]::ReadAllBytes($full)
        $ctx.Response.ContentType = $ct
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $ctx.Response.Close()
      }
    }
  } catch {
    try { $ctx.Response.StatusCode = 500; $ctx.Response.Close() } catch { }
  }
}
