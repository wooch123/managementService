# §13.3 "app.db와 meta.db를 매일 03:00에 data/backups/로 복사하는 Windows 예약 작업 스크립트. 30일 보관."
#
# 실제 백업/보관 정리 로직은 scripts/backup-db.ts에 있다(better-sqlite3의 온라인 백업 API로
# 안전하게 스냅샷을 뜨고, 30일 지난 파일을 정리한다) — 이 스크립트는 그걸 프로젝트 경로에서
# 실행시키는 얇은 Windows 작업 스케줄러용 래퍼다.
#
# 등록 방법 (관리자 PowerShell에서 한 번만 실행):
#
#   $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
#                -Argument '-NoProfile -ExecutionPolicy Bypass -File "F:\Claude\WebApp_V1\deploy\backup.ps1"'
#   $trigger = New-ScheduledTaskTrigger -Daily -At 03:00
#   Register-ScheduledTask -TaskName "WebApp_V1-DB-Backup" -Action $action -Trigger $trigger -RunLevel Highest
#
# 수동 확인:  Start-ScheduledTask -TaskName "WebApp_V1-DB-Backup"
# 등록 해제:  Unregister-ScheduledTask -TaskName "WebApp_V1-DB-Backup" -Confirm:$false

$ErrorActionPreference = "Stop"
$ProjectRoot = "F:\Claude\WebApp_V1"
$LogFile = Join-Path $ProjectRoot "data\backups\backup.log"

Set-Location $ProjectRoot

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
try {
    & pnpm db:backup 2>&1 | ForEach-Object { "$timestamp $_" } | Add-Content -Path $LogFile -Encoding utf8
    Add-Content -Path $LogFile -Value "$timestamp [backup.ps1] 완료" -Encoding utf8
} catch {
    Add-Content -Path $LogFile -Value "$timestamp [backup.ps1] 실패: $_" -Encoding utf8
    throw
}
