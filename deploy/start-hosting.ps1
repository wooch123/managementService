<#
  WebApp_V1 자동 호스팅 기동 스크립트 (Windows 작업 스케줄러에서 호출)

  ── 왜 이렇게 만들었나 (2026-08-18 재부팅 장애 조사 결과) ───────────────────────────
  원래는 pm2-windows-startup이 HKCU\...\Run에 등록한 wscript(숨김) → pm2_resurrect.cmd
  방식이었는데, 재부팅 후 서비스가 뜨지 않았다. 조사해 보니 두 가지 문제가 겹쳐 있었다.

   1) Run 키 트리거가 발화하지 않았다 — pm2.log에 데몬 기동 흔적조차 없었다. 숨김 실행이라
      실패해도 로그가 남지 않아 원인 추적이 불가능했다.
   2) 더 근본적으로, **작업 스케줄러/비대화형 컨텍스트에서는 %APPDATA%\npm 폴더가 비어
      보인다**(실측: 대화형 28개 항목 / 작업 컨텍스트 0개, Test-Path·[IO.File]::Exists 모두
      False). ACL·EFS·정션·Defender 제어된 폴더 액세스 모두 정상이었다. 즉 전역 npm에 설치된
      pm2(=pm2.cmd)는 자동 기동 경로에서 신뢰할 수 없다.

  그래서 자동 기동은 **F: 드라이브의 pm2 사본**(F:\Claude\tools\node_modules\pm2)을 node로
  직접 실행한다. 이 경로는 작업 컨텍스트에서도 정상적으로 보인다(실측). 전역 pm2는 사람이
  터미널에서 쓰는 용도로 그대로 두고, 상태(PM2_HOME=%USERPROFILE%\.pm2)는 둘이 공유한다.

  그 밖의 설계 원칙:
    - 실행 결과를 항상 data/logs/autostart.log에 남긴다(실패해도 원인을 볼 수 있게)
    - 여러 번 실행돼도 안전하다(이미 떠 있으면 아무것도 하지 않는다) → 감시(watchdog) 겸용
    - dump.pm2가 없거나 망가져도 절대경로로 직접 기동해 스스로 복구한다
    - 프로젝트 드라이브(F:)와 네트워크가 준비될 때까지 기다린다
    - 헬스체크까지 확인하고, 실패하면 0이 아닌 종료코드를 돌려준다(스케줄러가 재시도)

  등록: deploy/register-autostart.ps1 (관리자 권한 불필요)
#>

$ErrorActionPreference = 'Continue'

$Root         = 'F:\Claude\WebApp_V1'
$LogDir       = Join-Path $Root 'data\logs'
$LogFile      = Join-Path $LogDir 'autostart.log'
$Pm2Js        = 'F:\Claude\tools\node_modules\pm2\bin\pm2'
$Ecosystem    = 'F:/Claude/WebApp_V1/deploy/ecosystem.json'
$LocalHealth  = 'http://127.0.0.1:3000/api/health'
$PublicHealth = 'https://demo.dove9999.com/api/health'
$AppName      = 'webapp-v1'
$TunnelName   = 'cloudflared-tunnel'

# 전역 pm2(대화형)와 같은 상태 디렉터리를 쓰도록 못 박는다 — 그래야 사람이 pm2 list로 본 것과
# 자동 기동이 다루는 프로세스가 같은 것이 된다.
$env:PM2_HOME = Join-Path $env:USERPROFILE '.pm2'

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 1MB)) {
  Move-Item $LogFile "$LogFile.1" -Force   # 로그는 한 세대만 보관
}

function Write-Log([string]$msg) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  # Write-Output을 쓰면 로그 문자열이 함수 반환값에 섞여 Wait-Until의 $false가 배열이 되고,
  # if에서 항상 참으로 평가된다(2026-08-18 실측 — 실패를 성공으로 보고했다). 호스트로만 출력한다.
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Resolve-Exe([string[]]$Candidates, [string[]]$CommandNames) {
  foreach ($c in $Candidates) { if ($c -and (Test-Path $c)) { return $c } }
  foreach ($n in $CommandNames) {
    $cmd = Get-Command $n -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
  }
  return $null
}

$NodeExe = Resolve-Exe @('C:\Program Files\nodejs\node.exe') @('node.exe', 'node')
$Pm2Cmd  = Resolve-Exe @(
  (Join-Path $env:APPDATA 'npm\pm2.cmd'),
  (Join-Path $env:USERPROFILE 'AppData\Roaming\npm\pm2.cmd')
) @('pm2.cmd', 'pm2')
$Cloudflared = Resolve-Exe @(
  'C:\Program Files (x86)\cloudflared\cloudflared.exe',
  'C:\Program Files\cloudflared\cloudflared.exe'
) @('cloudflared.exe', 'cloudflared')

function Invoke-Pm2 {
  # F: 사본 우선, 없으면 전역 pm2로 넘어간다.
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Pm2Args)
  if ($NodeExe -and (Test-Path $Pm2Js)) { & $NodeExe $Pm2Js @Pm2Args 2>&1 }
  elseif ($Pm2Cmd)                      { & $Pm2Cmd @Pm2Args 2>&1 }
}

function Test-Net {
  # ICMP가 막힌 환경이 있어 TCP 443으로 확인한다.
  try {
    $c = New-Object Net.Sockets.TcpClient
    $ok = $c.ConnectAsync('1.1.1.1', 443).Wait(3000)
    $c.Close()
    return $ok
  } catch { return $false }
}

function Wait-Until([scriptblock]$Test, [int]$TimeoutSec, [string]$What) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    $ok = $false
    try { $ok = [bool](& $Test) } catch { $ok = $false }
    if ($ok) { return $true }
    Start-Sleep -Seconds 3
  }
  Write-Log ("대기 시간 초과({0}초): {1}" -f $TimeoutSec, $What)
  return $false
}

function Get-Pm2Status {
  # 이름 → 상태(online/stopped/errored) 해시. 데몬이 없으면 빈 해시.
  $map = @{}
  try {
    $raw = (Invoke-Pm2 jlist | Out-String)
    # pm2가 JSON 앞뒤로 '[PM2] ...' 배너를 찍을 때가 있어, 객체 배열이 시작하는 '[{'를 기준으로
    # 잘라낸다. 첫 '['를 쓰면 배너의 대괄호에 걸려 파싱이 통째로 실패한다(2026-08-18 실측 —
    # 그 탓에 이미 살아 있는 프로세스를 못 보고 중복 기동한 적이 있다).
    $start = $raw.IndexOf('[{')
    if ($start -lt 0) { return $map }
    $end = $raw.LastIndexOf('}]')
    if ($end -lt $start) { return $map }
    $apps = $raw.Substring($start, $end - $start + 2) | ConvertFrom-Json
    foreach ($a in $apps) { $map[$a.name] = $a.pm2_env.status }
  } catch { }
  return $map
}

function Test-LocalHealth {
  try { return [bool](Invoke-RestMethod -Uri $LocalHealth -TimeoutSec 5).ok } catch { return $false }
}

Write-Log '──────── 자동 호스팅 기동 시작 ────────'
Write-Log ("실행 계정: {0}\{1} / 부팅: {2}" -f $env:USERDOMAIN, $env:USERNAME, (Get-CimInstance Win32_OperatingSystem).LastBootUpTime)
Write-Log ("node='{0}' / pm2(F:)={1} / pm2(전역)='{2}' / cloudflared='{3}'" -f $NodeExe, (Test-Path $Pm2Js), $Pm2Cmd, $Cloudflared)

if (-not (Wait-Until { Test-Path (Join-Path $Root 'package.json') } 120 '프로젝트 경로(F: 드라이브) 준비')) {
  Write-Log "실패: $Root 를 찾을 수 없다. 드라이브 연결을 확인할 것."
  exit 2
}
if (-not ($NodeExe -and (Test-Path $Pm2Js)) -and -not $Pm2Cmd) {
  Write-Log "실패: pm2를 찾을 수 없다. F:\Claude\tools 에서 'npm install pm2@7.0.3' 실행할 것."
  exit 2
}
Wait-Until { Test-Net } 120 '네트워크 연결' | Out-Null

# 1) 이미 정상 기동돼 있으면 아무것도 건드리지 않는다(10분마다 감시 목적으로 실행되므로).
$status = Get-Pm2Status
if ($status[$AppName] -eq 'online' -and $status[$TunnelName] -eq 'online' -and (Test-LocalHealth)) {
  Write-Log '이미 정상 동작 중 — 조치 없음.'
  exit 0
}
Write-Log ("현재 상태: {0}='{1}', {2}='{3}'" -f $AppName, $status[$AppName], $TunnelName, $status[$TunnelName])

# 2) 정의 파일(deploy/ecosystem.json)로 기동한다. dump.pm2(resurrect)에 의존하지 않는 이유:
#    dump에는 과거에 잘못 기동된 항목까지 그대로 남아(중복 cloudflared, 인자 빠진 next) 되살아난다.
#    정의 파일은 이름으로 매칭되므로 이미 떠 있으면 재시작될 뿐 중복이 생기지 않는다.
Write-Log "ecosystem 정의로 기동: $Ecosystem"
Invoke-Pm2 start $Ecosystem | ForEach-Object { if ("$_".Trim()) { Write-Log "  pm2> $_" } }
Start-Sleep -Seconds 3
Invoke-Pm2 save | ForEach-Object { if ("$_".Trim()) { Write-Log "  pm2> $_" } }

# 3) 실제로 응답하는지 확인한다. 여기까지 통과해야 "기동 완료"다.
if (-not (Wait-Until { Test-LocalHealth } 120 '로컬 헬스체크')) {
  Write-Log '실패: 로컬 헬스체크 무응답. pm2 logs webapp-v1 확인 필요.'
  exit 1
}
$rev = 'unknown'
try { $rev = (Invoke-RestMethod -Uri $LocalHealth -TimeoutSec 5).revisionNo } catch { }
Write-Log ("로컬 정상 (배포 리비전 #{0})" -f $rev)

# 터널은 Cloudflare 엣지 연결까지 수십 초 걸릴 수 있어, 실패해도 경고만 남긴다.
if (Wait-Until { try { (Invoke-RestMethod -Uri $PublicHealth -TimeoutSec 8).ok } catch { $false } } 90 '공개 URL 헬스체크') {
  Write-Log '공개 URL 정상 (https://demo.dove9999.com)'
} else {
  Write-Log '경고: 공개 URL 아직 무응답 — 터널 연결 지연일 수 있다. pm2 logs cloudflared-tunnel 확인.'
}
Write-Log '──────── 기동 완료 ────────'
exit 0
