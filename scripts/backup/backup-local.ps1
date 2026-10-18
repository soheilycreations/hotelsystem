<#
.SYNOPSIS
  Full, restorable local backup of the Rawana PMS/POS Supabase database.

.DESCRIPTION
  Run on YOUR computer (not on the server). Creates, in -OutDir:
    full_dump.sql      public schema: tables, data, sequences, functions,
                       triggers, RLS policies, grants (plain SQL)
    data_only.sql      public schema data only (INSERT-able into an existing schema)
    auth_data.sql      staff login accounts (auth.users / auth.identities), data only
    counts.csv         exact row count per public table at backup time
    csv\<table>.csv    every public table as CSV (UTF-8 with BOM, opens in Excel)
    storage\<bucket>\  every file from Supabase Storage (logo, QR, menu images, bills)
    storage_index.csv  bucket / file / downloaded OK?
    README.md          row counts, file list, SHA-256 hashes, restore steps
  then checks: dump files complete, CSV row counts = database row counts,
  database did not change during the backup, every storage file downloaded.

  Contains guest names, NIC and phone numbers. Keep it off git (backups/ is
  .gitignored) and copy it to an encrypted USB / private Google Drive.

.PARAMETER DbUrl
  Supabase "Session pooler" connection string (Dashboard → Connect → Session
  pooler), e.g.
  postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
  Leave [YOUR-PASSWORD] as is — the script asks for the password separately
  so it never lands in your PowerShell history.

.PARAMETER TestRestoreUrl
  Optional. Connection string of a LOCAL PostgreSQL server (superuser), e.g.
  postgresql://postgres@localhost:5432/postgres . If given, the script loads
  full_dump.sql into a new scratch database rawana_restore_test there and
  compares every table's row count with counts.csv. Never point this at Supabase.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\backup\backup-local.ps1
#>
[CmdletBinding()]
param(
  [string]$DbUrl,
  [string]$OutDir,
  [string]$ProjectUrl,          # https://<ref>.supabase.co — derived from DbUrl if omitted
  [string]$TestRestoreUrl,
  [switch]$SkipStorage
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$script:Problems = New-Object System.Collections.Generic.List[string]

function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }
function Problem($msg) { $script:Problems.Add($msg); Say "  !! $msg" 'Red' }
function Fail($msg) { Say "`nBACKUP FAILED: $msg" 'Red'; exit 1 }

# ---------------------------------------------------------------- find tools
function Find-PgTool($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  $candidates = @()
  if ($IsWindows -or $env:OS -eq 'Windows_NT') {
    $candidates = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin' -ErrorAction SilentlyContinue |
      Sort-Object { [int]($_.Parent.Name -replace '\D', '') } -Descending |
      ForEach-Object { Join-Path $_.FullName "$name.exe" } | Where-Object { Test-Path $_ }
  }
  if ($candidates) { return @($candidates)[0] }   # newest installed version wins over PATH
  if ($cmd) { return $cmd.Source }
  Fail "$name not found. Install PostgreSQL 17 'Command Line Tools' (see README / instructions)."
}
$PgDump = Find-PgTool 'pg_dump'
$Psql   = Find-PgTool 'psql'

# ------------------------------------------------------------- connection
if (-not $DbUrl) {
  Say 'Paste the Supabase Session pooler connection string (keep [YOUR-PASSWORD] in it):' 'Cyan'
  $DbUrl = Read-Host 'DbUrl'
}
$DbUrl = $DbUrl.Trim().Trim('"')
if ($DbUrl -notmatch '^(postgres(?:ql)?://)([^:@/]+)(?::([^@]*))?@(.+)$') {
  Fail 'DbUrl does not look like postgresql://user:password@host:port/database'
}
$scheme = $Matches[1]; $dbUser = $Matches[2]; $pwInUrl = $Matches[3]; $rest = $Matches[4]
if ($pwInUrl -and $pwInUrl -ne '[YOUR-PASSWORD]') {
  $env:PGPASSWORD = [Uri]::UnescapeDataString($pwInUrl)
} elseif (-not $env:PGPASSWORD) {
  $sec = Read-Host 'Database password (input hidden)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
$Conn = "$scheme$dbUser@$rest"
if ($rest -match 'supabase\.(com|co)' -and $Conn -notmatch 'sslmode=') {
  $Conn += $(if ($Conn.Contains('?')) { '&' } else { '?' }) + 'sslmode=require'
}
if (-not $ProjectUrl -and $dbUser -match '^postgres\.([a-z0-9]+)$') { $ProjectUrl = "https://$($Matches[1]).supabase.co" }
if (-not $ProjectUrl -and $rest -match '^db\.([a-z0-9]+)\.supabase\.co') { $ProjectUrl = "https://$($Matches[1]).supabase.co" }

if (-not $OutDir) {
  $repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
  $OutDir = Join-Path $repoRoot 'backups\2026-10-18_pre-reset'
}
if ((Test-Path $OutDir) -and (Get-ChildItem $OutDir -Force | Select-Object -First 1)) {
  $OutDir = "$OutDir`_$(Get-Date -Format 'HHmmss')"
  Say "Backup folder already exists and is not empty — writing to $OutDir instead." 'Yellow'
}
New-Item -ItemType Directory -Force -Path $OutDir, (Join-Path $OutDir 'csv') | Out-Null
$OutDir = (Resolve-Path $OutDir).Path
$Fwd = $OutDir -replace '\\', '/'           # psql \copy wants forward slashes

function Invoke-Psql([string[]]$PsqlArgs, [string]$ConnStr = $Conn) {
  $out = & $Psql $ConnStr -X -v ON_ERROR_STOP=1 @PsqlArgs 2>&1
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $($out | Out-String)" }
  return $out
}

$CountSql = @"
select c.relname as table_name,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint as row_count
from pg_class c join pg_namespace s on s.oid = c.relnamespace
where s.nspname = 'public' and c.relkind = 'r' order by 1
"@ -replace "`r?`n", ' '

function Get-Counts {
  $h = [ordered]@{}
  foreach ($line in (Invoke-Psql @('-At', '-F', ',', '-c', $CountSql))) {
    $p = "$line".Split(','); $h[$p[0]] = [long]$p[1]
  }
  return $h
}

# ---------------------------------------------------------------- 1. checks
Say "`n== Rawana backup → $OutDir" 'Cyan'
Say "pg_dump: $PgDump"
$pgMajor = [int](((& $PgDump --version) -replace '^\D*(\d+).*$', '$1'))
try { $srvNum = [int]((Invoke-Psql @('-At', '-c', 'show server_version_num')) | Select-Object -First 1) }
catch { Fail "cannot connect to the database. Check the connection string and password.`n$($_.Exception.Message)" }
$srvMajor = [int][math]::Floor($srvNum / 10000)
Say "Server PostgreSQL $srvMajor, local pg_dump $pgMajor"
if ($pgMajor -lt $srvMajor) { Fail "pg_dump $pgMajor is older than the server ($srvMajor). Install PostgreSQL $srvMajor (or newer) command line tools." }

$countsBefore = Get-Counts
Say "Tables: $($countsBefore.Count), rows: $(($countsBefore.Values | Measure-Object -Sum).Sum)"

# ----------------------------------------------------------------- 2. dumps
function Dump($file, [string[]]$extra) {
  Say "-> $file"
  $path = Join-Path $OutDir $file
  & $PgDump $Conn --no-owner --quote-all-identifiers --file $path @extra
  if ($LASTEXITCODE -ne 0) { Fail "pg_dump failed for $file" }
  $tail = Get-Content $path -Tail 5 | Out-String
  if ($tail -notmatch 'PostgreSQL database dump complete') { Problem "$file looks incomplete (no completion marker)" }
}
Dump 'full_dump.sql' @('--schema=public')
Dump 'data_only.sql' @('--schema=public', '--data-only')
Say '-> auth_data.sql (staff logins)'
& $PgDump $Conn --no-owner --data-only --table=auth.users --table=auth.identities --file (Join-Path $OutDir 'auth_data.sql') 2>$null
if ($LASTEXITCODE -ne 0) { Problem 'auth_data.sql could not be dumped (no permission on auth schema?) — staff logins not backed up; they are not touched by the reset.' }

# ------------------------------------------------------------------ 3. CSVs
Say '-> csv\*.csv'
Invoke-Psql @('-c', "\copy ($CountSql) to '$Fwd/counts.csv' with (format csv, header)") | Out-Null
$BOM = [byte[]](0xEF, 0xBB, 0xBF)
foreach ($t in $countsBefore.Keys) {
  $csv = "$Fwd/csv/$t.csv"
  Invoke-Psql @('-c', "\copy (select * from public.""$t"") to '$csv' with (format csv, header)") | Out-Null
  $file = Join-Path (Join-Path $OutDir 'csv') "$t.csv"
  [IO.File]::WriteAllBytes($file, $BOM + [IO.File]::ReadAllBytes($file))   # BOM → Excel shows Sinhala/Tamil correctly
  $rows = @(Import-Csv -Path $file -Encoding UTF8).Count
  if ($rows -ne $countsBefore[$t]) { Problem "csv\$t.csv has $rows rows, database has $($countsBefore[$t])" }
}

# --------------------------------------------------------------- 4. storage
$storageRows = New-Object System.Collections.Generic.List[object]
if ($SkipStorage) {
  Say '-> storage: skipped (-SkipStorage)' 'Yellow'
} elseif (-not $ProjectUrl) {
  Problem 'storage not downloaded: could not work out the project URL — pass -ProjectUrl https://<ref>.supabase.co'
} else {
  Say "-> storage from $ProjectUrl"
  $objs = Invoke-Psql @('-At', '-F', "`t", '-c',
    "select bucket_id, name from storage.objects where name not like '%.emptyFolderPlaceholder' order by 1, 2")
  foreach ($line in $objs) {
    if (-not "$line") { continue }
    $bucket, $name = "$line".Split("`t", 2)
    $local = Join-Path (Join-Path (Join-Path $OutDir 'storage') $bucket) ($name -replace '/', [IO.Path]::DirectorySeparatorChar)
    New-Item -ItemType Directory -Force -Path (Split-Path $local -Parent) | Out-Null
    $enc = ($name.Split('/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
    $url = "$ProjectUrl/storage/v1/object/public/$bucket/$enc"
    $ok = $true
    try { Invoke-WebRequest -Uri $url -OutFile $local -UseBasicParsing | Out-Null }
    catch { $ok = $false; Problem "storage $bucket/$name not downloaded: $($_.Exception.Message)" }
    $storageRows.Add([pscustomobject]@{ bucket = $bucket; file = $name; downloaded = $ok })
  }
  $storageRows | Export-Csv -Path (Join-Path $OutDir 'storage_index.csv') -NoTypeInformation -Encoding UTF8
  Say "   $(@($storageRows | Where-Object downloaded).Count) of $($storageRows.Count) files downloaded"
}

# ------------------------------------------------- 5. changed during backup?
$countsAfter = Get-Counts
foreach ($t in $countsBefore.Keys) {
  if ($countsAfter[$t] -ne $countsBefore[$t]) {
    Problem "$t changed during the backup ($($countsBefore[$t]) → $($countsAfter[$t]) rows). Stop all use of the system and run the backup again."
  }
}

# ------------------------------------------------- 6. optional restore test
$restoreResult = 'not run (pass -TestRestoreUrl to test restoring into a local PostgreSQL)'
if ($TestRestoreUrl) {
  if ($TestRestoreUrl -match 'supabase\.(com|co)') { Fail '-TestRestoreUrl must be a LOCAL server, never Supabase.' }
  Say '-> restore test into local database rawana_restore_test'
  $stubs = Join-Path (Split-Path $PSScriptRoot -Parent) 'local\supabase-stubs.sql'
  $saved = $env:PGPASSWORD; Remove-Item Env:PGPASSWORD
  try {
    Invoke-Psql @('-q', '-c', 'drop database if exists rawana_restore_test', '-c', 'create database rawana_restore_test') $TestRestoreUrl | Out-Null
    $testDb = $TestRestoreUrl -replace '/[^/?]*(\?|$)', '/rawana_restore_test$1'
    Invoke-Psql @('-q', '-f', $stubs) $testDb | Out-Null
    Invoke-Psql @('-q', '-c', 'drop schema if exists public cascade') $testDb | Out-Null
    # staff_profiles references auth.users — give the stand-in auth.users the staff ids
    $staffIds = @(Invoke-Psql @('-At', '-c', 'select id from public.staff_profiles') | Where-Object { "$_" })
    if ($staffIds.Count -gt 0) {
      $vals = ($staffIds | ForEach-Object { "('$_')" }) -join ','
      Invoke-Psql @('-q', '-c', "insert into auth.users (id) values $vals") $testDb | Out-Null
    }
    Invoke-Psql @('-q', '-f', (Join-Path $OutDir 'full_dump.sql')) $testDb | Out-Null
    $mismatch = 0
    foreach ($line in (Invoke-Psql @('-At', '-F', ',', '-c', $CountSql) $testDb)) {
      $p = "$line".Split(',')
      if ([long]$p[1] -ne $countsBefore[$p[0]]) { $mismatch++; Problem "restore test: $($p[0]) has $($p[1]) rows, expected $($countsBefore[$p[0]])" }
    }
    $restoreResult = if ($mismatch -eq 0) { "PASSED — all $($countsBefore.Count) tables restored with identical row counts" } else { "FAILED — $mismatch table(s) differ" }
  } catch { Problem "restore test failed: $($_.Exception.Message)"; $restoreResult = 'FAILED — see errors' }
  finally { $env:PGPASSWORD = $saved }
  Say "   $restoreResult"
}

# ------------------------------------------------------------- 7. README
$hashes = Get-ChildItem $OutDir -File -Filter '*.sql' | ForEach-Object {
  '| {0} | {1:N0} KB | `{2}` |' -f $_.Name, [math]::Ceiling($_.Length / 1KB), (Get-FileHash $_.FullName -Algorithm SHA256).Hash
}
$countRows = $countsBefore.Keys | ForEach-Object { "| $_ | $($countsBefore[$_]) |" }
$status = if ($script:Problems.Count -eq 0) { 'VERIFIED — no problems found' } else { "$($script:Problems.Count) PROBLEM(S) — see list below" }
$readme = @"
# Rawana PMS/POS — backup before go-live reset

Taken: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz') from ``$($Conn -replace '//[^@]*@', '//***@')``
Server PostgreSQL $srvMajor · pg_dump $pgMajor · Status: **$status**
Local restore test: $restoreResult

> Contains guest names, NIC/passport and phone numbers. Do not commit, email or
> share. Keep one copy on an encrypted USB and one in a private Google Drive folder.

## Files

| File | Size | SHA-256 |
|---|---|---|
$($hashes -join "`n")

- ``full_dump.sql`` — everything in the ``public`` schema: tables, data, sequences (bill counter), enums, functions, triggers, RLS policies, grants.
- ``data_only.sql`` — the same data without schema, for loading into an already-built schema.
- ``auth_data.sql`` — staff login accounts (password hashes — treat as secret).
- ``counts.csv`` — row count per table at backup time.
- ``csv/`` — one CSV per table, opens directly in Excel.
- ``storage/<bucket>/`` — files from Supabase Storage; ``storage_index.csv`` lists them.
- Storage bucket *policies* are not in the dump; they are in ``supabase/schema.sql`` (section 11).

## Row counts

| Table | Rows |
|---|---|
$($countRows -join "`n")

## How to restore

**A. Quickest — from the in-database archive (no files needed).**
The schema ``archive_20261018`` inside Supabase holds a copy of every table.
Open ``scripts/restore-from-archive.sql`` in the Supabase SQL editor, run it once
as a dry run (it ends with a red "DRY RUN OK" message and changes nothing), then
set ``v_commit := true`` and run again. Current data is saved to a
``pre_restore_<time>`` schema first.

**B. From these files into a NEW/empty Supabase project.**
1. Install PostgreSQL command line tools (same as for the backup).
2. ``psql "<new project session pooler URL>" -v ON_ERROR_STOP=1 -c "drop schema public cascade"``
   (only on the NEW empty project!)
3. ``psql "<new project URL>" -v ON_ERROR_STOP=1 -f full_dump.sql``
4. Re-create staff users in Authentication (or load ``auth_data.sql`` with the help of a developer).
5. Upload the ``storage/<bucket>/`` folders back into buckets with the same names.
6. Run ``scripts/phase1-verify.sql``-style counts and compare with the table above.

**C. Only some data back into the existing project (e.g. one table).**
Open the CSV, or take that table's ``COPY``/``INSERT`` section from ``data_only.sql``.
Ask a developer — partial restores need care with linked tables.

## Problems found during backup
$(if ($script:Problems.Count -eq 0) { 'None.' } else { ($script:Problems | ForEach-Object { "- $_" }) -join "`n" })
"@
[IO.File]::WriteAllText((Join-Path $OutDir 'README.md'), $readme, $Utf8NoBom)
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

# --------------------------------------------------------------- summary
Say ''
if ($script:Problems.Count -eq 0) {
  Say "BACKUP OK — $($countsBefore.Count) tables, all checks passed." 'Green'
} else {
  Say "BACKUP FINISHED WITH $($script:Problems.Count) PROBLEM(S):" 'Red'
  $script:Problems | ForEach-Object { Say "  - $_" 'Red' }
}
Say "Folder: $OutDir"
Say 'NEXT: copy this whole folder to an encrypted USB AND a private Google Drive folder.' 'Yellow'
Say '      It contains guest NIC/phone numbers — never commit, email or share it.' 'Yellow'
if ($script:Problems.Count -gt 0) { exit 2 }
