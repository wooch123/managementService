<#
  운영 재배포 — 빌드 중에도 서비스가 계속 살아 있게 한다.

  왜: 예전 절차(`pnpm build` 후 `pm2 restart`)는 서비스 중인 .next 폴더를 비우면서 빌드했다.
  그 90초 남짓 동안 프로세스가 재시작되면 "Could not find a production build in the '.next'
  directory"로 기동에 실패한다(pm2 error 로그에 8회 기록). 그래서 지금 쓰지 않는 폴더에 빌드하고,
  다 만든 뒤에 프로세스만 그쪽으로 옮긴다. 중단 시간은 빌드 전체가 아니라 재시작 몇 초로 줄어든다.

  사용법:
    powershell -NoProfile -ExecutionPolicy Bypass -File F:\Claude\WebApp_V1\deploy\redeploy.ps1
#>

$ErrorActionPreference = 'Stop'

$Root       = 'F:\Claude\WebApp_V1'
$Ecosystem  = Join-Path $Root 'deploy\ecosystem.json'
$HealthUrl  = 'http://127.0.0.1:3000/api/health'
$Pm2        = Join-Path $env:APPDATA 'npm\pm2.cmd'
if (-not (Test-Path $Pm2)) { $Pm2 = 'F:\Claude\tools\node_modules\pm2\bin\pm2' }

function Invoke-Pm2 {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  if ($Pm2 -like '*.cmd') { & $Pm2 @Args }
  else { & 'C:\Program Files\nodejs\node.exe' $Pm2 @Args }
}

Set-Location $Root

# 현재 서비스 중인 폴더를 ecosystem에서 읽고, 반대편을 이번 빌드 대상으로 삼는다.
$eco = Get-Content $Ecosystem -Raw | ConvertFrom-Json
$app = $eco.apps | Where-Object { $_.name -eq 'webapp-v1' }
$current = if ($app.env.NEXT_DIST_DIR) { $app.env.NEXT_DIST_DIR } else { '.next' }
$target  = if ($current -eq '.next-a') { '.next-b' } else { '.next-a' }

Write-Host "현재 서비스 폴더: $current → 이번 빌드: $target"

# 1) 서비스에 영향 없는 폴더에 빌드
$env:NEXT_DIST_DIR = $target
$env:NODE_ENV = 'production'
Write-Host '빌드 시작(서비스는 계속 동작 중)...'
& pnpm build
if ($LASTEXITCODE -ne 0) { throw "빌드 실패 — 배포를 중단한다(서비스는 $current 그대로 동작 중)." }

# 2) 정의 파일을 새 폴더로 갱신하고 프로세스만 옮긴다
$app.env | Add-Member -NotePropertyName NEXT_DIST_DIR -NotePropertyValue $target -Force
($eco | ConvertTo-Json -Depth 10) | Set-Content -Path $Ecosystem -Encoding utf8
Write-Host '프로세스 전환(재시작)...'
Invoke-Pm2 start $Ecosystem --only webapp-v1 --update-env | Out-Null

# 3) 살아났는지 확인 — 실패하면 이전 폴더로 되돌린다
$ok = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 2
  try {
    $res = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 4
    if ($res.ok) { $ok = $true; break }
  } catch { }
}

if (-not $ok) {
  Write-Warning "새 빌드가 응답하지 않는다 — $current 로 되돌린다."
  $app.env.NEXT_DIST_DIR = $current
  ($eco | ConvertTo-Json -Depth 10) | Set-Content -Path $Ecosystem -Encoding utf8
  Invoke-Pm2 start $Ecosystem --only webapp-v1 --update-env | Out-Null
  throw '배포 실패 — 이전 빌드로 롤백했다.'
}

$rev = (Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5).revisionNo
Write-Host "배포 완료 — 서비스 폴더 $target, 배포 리비전 #$rev"

# 3-1) 배포된 스펙이 쓰는 컬럼에 인덱스를 맞춘다(없으면 만들고, 있으면 건너뛴다).
& pnpm db:optimize

# 4) 이제 아무도 쓰지 않는 이전 폴더를 정리한다(.next는 예전 방식 잔재라 함께 지운다)
foreach ($old in @($current, '.next')) {
  if ($old -ne $target -and (Test-Path (Join-Path $Root $old))) {
    try { Remove-Item (Join-Path $Root $old) -Recurse -Force -ErrorAction Stop; Write-Host "이전 빌드 폴더 정리: $old" }
    catch { Write-Host "정리 보류(사용 중일 수 있음): $old" }
  }
}
