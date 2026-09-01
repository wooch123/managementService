<#
  Windows에서 이 저장소를 **받은 그대로 서비스 상태까지** 올린다 — `run.sh`의 윈도우 짝이다.

      start.bat            프로덕션 모드로 빌드 후 실행 (http://localhost:3000)
      start.bat dev        개발 서버 (파일을 고치면 바로 반영)
      start.bat --port 8080
      start.bat --host     0.0.0.0에 바인딩 + 방화벽 포트 열기 (같은 망에서 접속)
      start.bat --tunnel   공유기 설정 없이 인터넷에서 닿는 https 주소를 받는다
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
$Tunnel      = $false        # --tunnel - 공유기를 건드리지 않고 바깥에서 닿게 한다.

for ($i = 0; $i -lt $args.Count; $i++) {
  $a = [string]$args[$i]
  if     ($a -eq 'dev')            { $Mode = 'dev' }
  elseif ($a -eq 'start')          { $Mode = 'start' }
  elseif ($a -eq 'setup')          { $Mode = 'setup' }
  elseif ($a -eq '--skip-build')   { $SkipBuild = $true }
  elseif ($a -eq '--skip-install') { $SkipInstall = $true }
  elseif ($a -eq '--no-firewall')  { $OpenPort = $false }
  elseif ($a -eq '--tunnel')       { $Tunnel = $true; $BindHost = '0.0.0.0' }
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
  start.bat --tunnel         공유기 설정 없이 인터넷에서 닿는 https 주소를 받는다
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
#
# DB는 "있는지"만 보면 모자란다. SQLite는 없는 파일을 열라면 말없이 빈 DB를 만들기 때문에,
# 한 번 잘못 띄우고 나면 0바이트짜리 meta.db가 남는다. 그 뒤로는 파일이 '있으니' Test-Path는
# 통과하고, 앱만 "The table main.Revision does not exist"로 계속 깨진다 - 원인을 찾기
# 어려운 쪽이라 여기서 크기와 머리글까지 본다(실제로 이 오류가 보고됐다).
function Test-SqliteDb {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return '파일이 없습니다' }
  $len = (Get-Item $Path).Length
  if ($len -eq 0) { return '파일이 비어 있습니다(0바이트). 앞선 실행이 만들어 둔 빈 파일이니 지우고 다시 받으세요' }
  try {
    $head = [System.IO.File]::ReadAllBytes($Path)[0..14]
    if ([System.Text.Encoding]::ASCII.GetString($head) -ne 'SQLite format 3') { return 'SQLite 파일이 아닙니다(내용이 깨졌을 수 있습니다)' }
  } catch { return '읽지 못했습니다' }
  return $null
}

if (-not (Test-Path 'package.json')) { Die 'package.json이 없습니다. 저장소 루트에서 실행하세요.' }
foreach ($db in @(
  @{ Path = 'prisma\meta.db'; What = '설계 데이터' },
  @{ Path = 'data\app.db';    What = '업무 데이터' }
)) {
  $problem = Test-SqliteDb $db.Path
  if ($problem) { Die "$($db.Path) — $problem. $($db.What)는 저장소에 함께 들어 있습니다: git checkout -- $($db.Path)" }
}

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

# ── 5) 주소 ─────────────────────────────────────────────────────────────────
#
# 이 PC의 IP를 **나가는 경로에서** 찾는다. IPv4 목록의 첫 값을 쓰면 Hyper-V·WSL·VPN 같은 가상
# 어댑터가 먼저 잡혀, 다른 기기에서 닿지도 않는 주소를 안내하게 된다. 커널에게 "1.1.1.1로 나갈 때
# 어느 주소를 쓰느냐"고 물으면 실제로 쓰이는 그 주소가 나온다.
function Get-LanIp {
  try {
    $r = Find-NetRoute -RemoteIPAddress 1.1.1.1 -ErrorAction Stop | Select-Object -First 1
    if ($r -and $r.IPAddress) { return $r.IPAddress }
  } catch { }
  try {
    return Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -First 1 -ExpandProperty IPAddress
  } catch { return $null }
}

# 사설 대역인가 — 사설이면 그 주소는 이 망 안에서만 통한다.
function Test-PrivateIp {
  param([string]$Ip)
  if (-not $Ip) { return $true }
  if ($Ip -match '^(10\.|127\.|169\.254\.|192\.168\.)') { return $true }
  if ($Ip -match '^172\.(1[6-9]|2[0-9]|3[0-1])\.') { return $true }
  return $false
}

# 바깥에서 보이는 주소. 못 물어보면 $null - 없다고 실행을 막지는 않는다.
function Get-PublicIp {
  try { return (Invoke-RestMethod 'https://api.ipify.org' -TimeoutSec 5 -ErrorAction Stop).Trim() }
  catch { return $null }
}

$LanIp = if ($BindHost -eq '0.0.0.0') { Get-LanIp } else { $null }
$urlHost = if ($LanIp) { $LanIp } else { 'localhost' }

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

# 어디로 들어올 수 있는지 **있는 그대로** 적는다.
#
# 포트를 열었다고 밖에서 닿는 것은 아니다. 이 PC가 사설 대역에 있으면 바깥에서 보이는 주소는
# 공유기의 것이고, 그 공유기가 이 PC로 넘겨 주지 않는 한 아무도 못 들어온다. 그 사실을 감추고
# 주소만 적어 두면 "열었다는데 안 된다"가 되므로, 무엇이 더 필요한지 함께 적는다.
function Show-Address {
  Info "이 PC   http://localhost:${Port}/home"
  if ($BindHost -ne '0.0.0.0') {
    Info "관리자  http://localhost:${Port}/admin  (admin / 123456)"
    return
  }

  if ($LanIp) { Info "같은 망  http://${LanIp}:${Port}/home" }
  else { Warn '이 PC의 주소를 찾지 못했습니다 - 같은 망에서 쓸 주소는 직접 확인해 주세요(ipconfig).' }

  $wan = Get-PublicIp
  if (-not $wan) {
    Info '바깥 주소는 확인하지 못했습니다(인터넷에 못 물어봤습니다).'
  } elseif ($LanIp -and $wan -eq $LanIp) {
    Info "인터넷   http://${wan}:${Port}/home   (이 PC가 공인 IP를 직접 갖고 있습니다)"
  } elseif (Test-PrivateIp $LanIp) {
    Info "인터넷   http://${wan}:${Port}/  <- 지금은 닿지 않습니다"
    Info "         이 PC는 사설 주소($LanIp)라 공유기가 가로막고 있습니다. 둘 중 하나가 필요합니다:"
    Info "           . 공유기에서 ${Port} 포트를 $LanIp 로 넘기기(포트포워딩)"
    Info '           . 또는 start.bat --tunnel  - 공유기를 건드리지 않고 https 주소를 받습니다'
  }

  Info "관리자  .../admin  (admin / 123456 - 바꾸려면 pnpm admin:password `"새 비밀번호`")"
}

# 공유기를 건드리지 않고 바깥에서 닿게 하는 길 - cloudflared의 임시 터널.
#
# 공인 IP도 포트포워딩도 없이 https 주소 하나를 받는다. 대신 **인터넷 전체에 열린다** -
# 그래서 옵션으로만 켜지고, 켤 때마다 비밀번호를 먼저 확인하라고 말한다.
$TunnelLog = Join-Path $PSScriptRoot 'data\logs\tunnel.log'
$script:TunnelProc = $null

function Start-Tunnel {
  $cf = Get-Command cloudflared -ErrorAction SilentlyContinue
  if (-not $cf) { $p = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'; if (Test-Path $p) { $cf = $p } }
  if (-not $cf) {
    Warn 'cloudflared가 없어 터널을 열지 못했습니다. 설치한 뒤 다시 실행해 주세요:'
    Info '  winget install --id Cloudflare.cloudflared'
    return
  }
  $exe = if ($cf -is [string]) { $cf } else { $cf.Source }
  Warn '터널을 엽니다 - 이 주소는 **인터넷 누구나** 열 수 있습니다.'
  Warn '관리자 비밀번호를 아직 안 바꿨다면 지금 멈추고 바꾸세요: pnpm admin:password "새 비밀번호"'
  New-Item -ItemType Directory -Force -Path (Split-Path $TunnelLog) | Out-Null
  Set-Content -Path $TunnelLog -Value '' -Encoding utf8
  $script:TunnelProc = Start-Process $exe `
    -ArgumentList 'tunnel', '--url', "http://127.0.0.1:$Port", '--no-autoupdate' `
    -NoNewWindow -PassThru -RedirectStandardError $TunnelLog -RedirectStandardOutput "$TunnelLog.out"
  # 주소가 로그에 찍힐 때까지 최대 20초 기다린다.
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    $hit = Select-String -Path $TunnelLog, "$TunnelLog.out" -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($hit) { Ok ("인터넷 주소: " + $hit.Matches[0].Value + "/home"); Info '  이 주소는 이 창을 닫으면 사라집니다(임시 터널).'; return }
    if ($script:TunnelProc.HasExited) { break }
  }
  Warn "터널 주소를 받지 못했습니다. 자세한 내용: $TunnelLog"
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
if ($BindHost -eq '0.0.0.0') { Warn '관리자 비밀번호를 바꾸지 않았다면 먼저 바꾸세요.' }

if ($Tunnel) {
  # 터널은 서버가 뜬 뒤라야 붙는다 - 먼저 띄우고, 주소를 받은 다음 서버를 기다린다.
  $server = Start-Process pnpm -ArgumentList 'exec', 'next', 'start', '-p', $Port, '-H', $BindHost -NoNewWindow -PassThru
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    try { $null = Invoke-WebRequest "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; break } catch { }
    if ($server.HasExited) { break }
  }
  Start-Tunnel
  Write-Tint '  중지: Ctrl+C' 'DarkGray'
  Write-Host ''
  try { $server.WaitForExit() } finally {
    if ($script:TunnelProc -and -not $script:TunnelProc.HasExited) { $script:TunnelProc.Kill() }
  }
  exit $server.ExitCode
}

Write-Tint '  중지: Ctrl+C' 'DarkGray'
Write-Host ''
& pnpm exec next start -p $Port -H $BindHost
exit $LASTEXITCODE
