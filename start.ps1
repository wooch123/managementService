<#
  Windows에서 이 저장소를 **받은 그대로 서비스 상태까지** 올린다 — `run.sh`의 윈도우 짝이다.

      start.bat            프로덕션 모드로 빌드 후 실행 (http://localhost:3000)
      start.bat dev        개발 서버 (파일을 고치면 바로 반영)
      start.bat --port 8080
      start.bat --host     0.0.0.0에 바인딩 (같은 망의 다른 기기에서 접속)
      start.bat --skip-build
      start.bat setup      설치·준비까지만 하고 실행하지 않음

  하는 일과 순서는 run.sh와 같다. 이미 갖춰진 단계는 건너뛰므로 몇 번을 실행해도 결과가 같다.

      1) Node.js 20+       없으면 winget으로 설치(없으면 받는 곳을 안내한다)
      2) pnpm              corepack → npm 전역 순으로 시도
      3) pnpm install      lockfile 그대로. 안 맞으면 잠금을 갱신해 한 번 더
      4) 준비              세션 서명 키(.env.local)·Prisma 클라이언트·빈 폴더
      5) 빌드·실행

  **왜 .bat 안에 다 넣지 않고 이 파일로 나눴나.** cmd.exe는 배치 파일을 OEM 코드페이지로 읽어서
  UTF-8 한글이 그대로 깨진다. 코드페이지를 바꾸는 우회는 콘솔 설정에 따라 되기도 안 되기도 한다.
  PowerShell은 UTF-8을 제대로 읽으므로 말이 들어가는 쪽을 이리로 옮겼다(deploy\*.ps1과 같은 방식).
  그래서 이 파일은 **UTF-8 BOM**으로 저장한다 — Windows PowerShell 5.1은 BOM이 없으면 ANSI로 읽는다.
#>

$ErrorActionPreference = 'Stop'

# 저장소 뿌리에서 돈다 — 탐색기에서 두 번 눌러 실행해도 작업 폴더가 엉뚱한 곳일 수 있다.
Set-Location $PSScriptRoot

# ── 표시 ────────────────────────────────────────────────────────────────────
# 글자는 ASCII만 쓴다(색이 뜻을 나른다). CP949 콘솔에서 기호가 물음표로 바뀌는 일을 피한다.
$UseColor = [string]::IsNullOrEmpty($env:NO_COLOR)
function Write-Tint { param([string]$Text, [string]$Color)
  if ($UseColor -and $Color) { Write-Host $Text -ForegroundColor $Color } else { Write-Host $Text }
}
function Step { param([string]$m) Write-Host ''; Write-Tint "> $m" 'White' }
function Info { param([string]$m) Write-Host "  $m" }
function Ok   { param([string]$m) Write-Tint "  + $m" 'Green' }
function Warn { param([string]$m) Write-Tint "  ! $m" 'Yellow' }
function Die  { param([string]$m) Write-Host ''; Write-Tint "x $m" 'Red'; Write-Host ''; exit 1 }

# ── 옵션 ────────────────────────────────────────────────────────────────────
$Mode        = 'start'      # start | dev | setup
$Port        = 3000
$BindHost    = '127.0.0.1'  # $Host는 PowerShell이 쓰는 이름이라 못 쓴다
$SkipBuild   = $false
$SkipInstall = $false
$OpenPort    = $true         # --host일 때만 의미가 있다. --no-firewall로 끈다.

for ($i = 0; $i -lt $args.Count; $i++) {
  $a = [string]$args[$i]
  if     ($a -eq 'dev')            { $Mode = 'dev' }
  elseif ($a -eq 'start')          { $Mode = 'start' }
  elseif ($a -eq 'setup')          { $Mode = 'setup' }
  elseif ($a -eq '--skip-build')   { $SkipBuild = $true }
  elseif ($a -eq '--skip-install') { $SkipInstall = $true }
  elseif ($a -eq '--no-firewall')  { $OpenPort = $false }
  elseif ($a -eq '--host')         { $BindHost = '0.0.0.0' }
  elseif ($a -like '--host=*')     { $BindHost = $a.Substring(7) }
  elseif ($a -eq '--port') {
    if ($i + 1 -ge $args.Count) { Die '--port 다음에 포트 번호가 필요합니다' }
    $i++; $Port = [string]$args[$i]
  }
  elseif ($a -like '--port=*')     { $Port = $a.Substring(7) }
  elseif ($a -eq '-h' -or $a -eq '--help' -or $a -eq '/?') {
    Write-Host @'
사용법
  start.bat                  프로덕션 모드로 빌드 후 실행 (http://localhost:3000)
  start.bat dev              개발 서버 (파일을 고치면 바로 반영)
  start.bat --port 8080      포트 지정
  start.bat --host           0.0.0.0에 바인딩 + 방화벽에 포트를 연다 (다른 기기에서 접속)
  start.bat --no-firewall    --host와 함께 — 바인딩만 하고 방화벽은 건드리지 않는다
  start.bat --skip-build     빌드를 건너뛰고 기존 산출물로 실행
  start.bat --skip-install   의존성 설치를 건너뛴다
  start.bat setup            설치·준비까지만 하고 실행하지 않음
'@
    exit 0
  }
  else { Die "모르는 옵션입니다: $a   (start.bat --help)" }
}

if ($Port -notmatch '^\d+$') { Die "포트는 숫자여야 합니다: $Port" }
$Port = [int]$Port

Write-Tint 'WebApp_V1 - 로컬 실행 준비' 'DarkGray'

# ── 0) 이 저장소가 맞는지 ───────────────────────────────────────────────────
if (-not (Test-Path 'package.json'))   { Die 'package.json이 없습니다. 저장소 루트에서 실행하세요.' }
if (-not (Test-Path 'prisma\meta.db')) { Die 'prisma\meta.db가 없습니다. 저장소를 다시 받아 주세요(설계 데이터가 저장소에 함께 들어 있습니다).' }
if (-not (Test-Path 'data\app.db'))    { Die 'data\app.db가 없습니다. 저장소를 다시 받아 주세요(업무 데이터가 저장소에 함께 들어 있습니다).' }

# package.json이 못 박아 둔 pnpm 버전 — 대체 경로로 넣을 때도 같은 것을 넣는다.
$wantPnpm = 'latest'
$pkgManager = (Get-Content 'package.json' -Raw | ConvertFrom-Json).packageManager
if ($pkgManager -match '^pnpm@(.+)$') { $wantPnpm = $Matches[1] }

# winget 등이 넣은 것을 이 세션에서 바로 쓰려면 PATH를 다시 읽어야 한다(새 창을 열지 않아도 되게).
function Update-PathFromRegistry {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ';'
}

# ── 1) Node.js 20+ ──────────────────────────────────────────────────────────
Step 'Node.js'

function Get-NodeMajor {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return 0 }
  try { $v = & node -v } catch { return 0 }
  if (-not $v) { return 0 }
  return [int](($v -replace '^v', '') -split '\.')[0]
}

if ((Get-NodeMajor) -ge 20) {
  Ok "이미 있음 ($(& node -v))"
} else {
  if (Get-Command node -ErrorAction SilentlyContinue) {
    Warn "Node $(& node -v)는 너무 낮습니다(20 이상 필요) - 새로 설치합니다"
  } else {
    Info 'Node.js가 없습니다 - 설치합니다'
  }
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Info 'winget으로 설치: OpenJS.NodeJS.LTS'
    try {
      & winget install --id OpenJS.NodeJS.LTS --exact --source winget `
        --accept-package-agreements --accept-source-agreements --disable-interactivity
    } catch { }
    Update-PathFromRegistry
  } else {
    Warn 'winget이 없습니다 - 직접 설치해 주세요'
  }
  if ((Get-NodeMajor) -lt 20) {
    Die "Node 20 이상을 준비하지 못했습니다. https://nodejs.org/ 에서 LTS를 설치한 뒤 이 창을 닫고 다시 실행해 주세요."
  }
  Ok "설치 완료 ($(& node -v))"
}

# ── 2) pnpm ─────────────────────────────────────────────────────────────────
Step 'pnpm'

# pnpm이 **실제로 도는지** 본다. PATH에 있는지만 보면 안 된다 - corepack은 `enable` 하는 순간
# 자리표(shim)를 만들고, 진짜 내려받기와 서명 확인은 처음 실행할 때 일어난다. 그때 막히면
# 자리표만 있고 pnpm은 없는 상태가 되는데, 그것을 '설치 성공'으로 세면 다음 단계에서 죽는다.
function Test-Pnpm {
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { return $false }
  try { $null = & pnpm --version } catch { return $false }
  return ($LASTEXITCODE -eq 0)
}

if (Test-Pnpm) {
  Ok "이미 있음 (pnpm $(& pnpm --version))"
} else {
  Info 'pnpm이 없습니다 - 설치합니다'
  # (a) corepack: Node에 딸려 온다. package.json의 packageManager 버전을 그대로 쓴다.
  if (Get-Command corepack -ErrorAction SilentlyContinue) {
    try {
      & corepack enable pnpm | Out-Null
      & corepack prepare --activate | Out-Null
    } catch { }
    Update-PathFromRegistry
    if (-not (Test-Pnpm)) {
      # 대개 서명 확인 실패다(낡은 corepack에 박힌 npm 서명 키가 지금 레지스트리 키와 다르다).
      # 자리표를 걷어내지 않으면 아래에서 npm으로 넣은 pnpm을 그 자리표가 계속 가린다.
      Warn 'corepack으로 가져오지 못했습니다 - npm으로 넣습니다'
      try { & corepack disable pnpm | Out-Null } catch { }
    }
  }
  # (b) npm 전역 - 못 박아 둔 버전 그대로. npm도 레지스트리가 준 무결성 해시로 받은 것을 확인한다.
  if (-not (Test-Pnpm)) {
    try { & npm install -g "pnpm@$wantPnpm" | Out-Null } catch { }
    Update-PathFromRegistry
  }
  if (-not (Test-Pnpm)) {
    Die "pnpm 설치에 실패했습니다. 직접 설치해 주세요: npm install -g pnpm@$wantPnpm"
  }
  Ok "설치 완료 (pnpm $(& pnpm --version))"
}

# ── 3) 의존성 ───────────────────────────────────────────────────────────────
if ($SkipInstall) {
  Step '의존성 (건너뜀)'
} else {
  Step '의존성 설치'
  & pnpm install --frozen-lockfile
  if ($LASTEXITCODE -eq 0) {
    Ok '설치 완료'
  } else {
    # 잠금이 어긋나도 여기서 멈추면 "받아서 바로 실행"이라는 목적 자체가 무너진다.
    Warn '잠금 파일 그대로는 설치되지 않았습니다 - 잠금을 갱신해 다시 시도합니다'
    & pnpm install
    if ($LASTEXITCODE -ne 0) { Die '의존성 설치에 실패했습니다. 위 오류를 확인해 주세요.' }
    Ok '설치 완료(잠금 갱신됨)'
  }
}

# ── 4) 준비 ─────────────────────────────────────────────────────────────────
Step '실행 준비'
# 세션 서명 키(.env.local), Prisma 클라이언트, 빈 폴더 - 저장소에 담을 수 없는 것만 만든다.
& pnpm setup:local
if ($LASTEXITCODE -ne 0) { Die '준비 단계에서 실패했습니다.' }

# ── 5) 빌드 · 실행 ──────────────────────────────────────────────────────────
$urlHost = $BindHost
if ($BindHost -eq '0.0.0.0') {
  # 같은 망의 다른 기기가 쓸 주소를 안내한다. 못 찾으면 localhost로 둔다.
  try {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -First 1 -ExpandProperty IPAddress
  } catch { $ip = $null }
  if ($ip) { $urlHost = $ip } else { $urlHost = 'localhost' }
}

# ── 방화벽 ──────────────────────────────────────────────────────────────────
#
# 0.0.0.0에 붙였다고 밖에서 들어올 수 있는 것은 아니다. 윈도우 방화벽은 기본으로 막고 있어
# "서버는 떴는데 다른 기기에서만 안 되는" 상태가 된다 - 원인을 찾기 어려운 쪽이라 열어 준다
# (사용자 지정). 127.0.0.1에 붙을 때는 아무것도 하지 않는다: 밖에서 못 들어오는 것이 맞다.
#
# 규칙은 **개인·도메인 프로필에만** 넣는다. 공용 네트워크(카페 Wi-Fi 등)까지 열면 사무실 밖에서
# 노트북을 켜는 순간 낯선 망에 그대로 노출된다.
$FirewallRuleName = "WebApp_V1 (TCP $Port)"

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function New-PortRule {
  New-NetFirewallRule -DisplayName $FirewallRuleName -Direction Inbound -Action Allow `
    -Protocol TCP -LocalPort $Port -Profile Private,Domain -ErrorAction Stop | Out-Null
}

# 서버를 띄우기 **직전**에 부른다 - 빌드가 깨졌는데 포트만 열려 있는 상태를 만들지 않는다.
function Open-PortIfAsked {
  if ($BindHost -ne '0.0.0.0') { return }
  Step '방화벽'
  if (-not $OpenPort) { Info '--no-firewall - 방화벽은 건드리지 않습니다'; return }

  # 지금 붙어 있는 망이 '공용'으로 분류돼 있으면 개인·도메인 규칙은 걸리지 않는다. 조용히
  # 안 되는 것이 가장 나쁘므로 미리 밝힌다 - 넓히는 것은 사람이 판단할 일이다.
  try {
    $public = Get-NetConnectionProfile -ErrorAction Stop |
      Where-Object { $_.NetworkCategory -eq 'Public' } | Select-Object -First 1
  } catch { $public = $null }
  if ($public) {
    Warn "지금 망('$($public.Name)')이 '공용'으로 분류돼 있어 이 규칙이 걸리지 않습니다."
    Info '  사무실 망이 맞다면 설정 > 네트워크에서 개인으로 바꾸거나, 관리자 PowerShell에서:'
    Info "  Set-NetConnectionProfile -Name '$($public.Name)' -NetworkCategory Private"
  }

  $existing = $null
  try { $existing = Get-NetFirewallRule -DisplayName $FirewallRuleName -ErrorAction Stop } catch { }
  if ($existing) { Ok "이미 열려 있음 ($FirewallRuleName)"; return }

  if (Test-Admin) {
    try { New-PortRule; Ok "$Port/tcp 열림 (개인·도메인 프로필)" }
    catch { Warn "방화벽 규칙을 넣지 못했습니다: $($_.Exception.Message)" }
    return
  }

  # 관리자가 아니면 그 한 줄만 올려서 실행한다 - UAC 창이 곧 사용자의 승낙이다.
  Info '관리자 권한이 필요합니다 - 확인 창이 뜨면 허용해 주세요'
  $inner = "New-NetFirewallRule -DisplayName '$FirewallRuleName' -Direction Inbound " +
           "-Action Allow -Protocol TCP -LocalPort $Port -Profile Private,Domain | Out-Null"
  try {
    $proc = Start-Process powershell -Verb RunAs -Wait -PassThru `
      -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $inner -ErrorAction Stop
    if ($proc.ExitCode -eq 0) { Ok "$Port/tcp 열림 (개인·도메인 프로필)" }
    else { Warn "방화벽 규칙을 넣지 못했습니다(종료 코드 $($proc.ExitCode))" }
  } catch {
    # 사용자가 확인 창을 취소한 경우가 대부분이다. 서버는 그대로 띄운다 - 같은 PC에서는 된다.
    Warn '열지 못했습니다. 관리자 PowerShell에서 직접:'
    Info "  $inner"
  }
}

if ($Mode -eq 'setup') {
  Step '준비 완료'
  Info '실행: start.bat          (프로덕션)'
  Info '      start.bat dev      (개발 서버)'
  exit 0
}

function Show-Address {
  Info "주소: http://${urlHost}:${Port}/home"
  Info "관리자: http://${urlHost}:${Port}/admin  (admin / 123456 - 바꾸려면 pnpm admin:password `"새 비밀번호`")"
}

if ($Mode -eq 'dev') {
  Open-PortIfAsked
  Step '개발 서버 시작'
  Show-Address
  Write-Tint '  중지: Ctrl+C' 'DarkGray'
  Write-Host ''
  & pnpm exec next dev --turbopack -p $Port -H $BindHost
  exit $LASTEXITCODE
}

if ($SkipBuild) {
  Step '빌드 (건너뜀)'
  if (-not (Test-Path '.next\BUILD_ID')) { Die '빌드 산출물이 없습니다(.next). --skip-build 없이 다시 실행해 주세요.' }
} else {
  Step '빌드'
  Info '처음에는 1~3분쯤 걸립니다'
  & pnpm build
  if ($LASTEXITCODE -ne 0) { Die '빌드에 실패했습니다. 위 오류를 확인해 주세요.' }
  Ok '빌드 완료'
}

Open-PortIfAsked

Step '서버 시작'
Show-Address
if ($BindHost -eq '0.0.0.0') {
  Warn '0.0.0.0에 바인딩합니다 - 같은 망의 다른 기기에서 접속할 수 있습니다.'
  Warn '관리자 비밀번호를 바꾸지 않았다면 먼저 바꾸세요.'
}
Write-Tint '  중지: Ctrl+C' 'DarkGray'
Write-Host ''
& pnpm exec next start -p $Port -H $BindHost
exit $LASTEXITCODE
