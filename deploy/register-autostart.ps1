<#
  자동 호스팅 작업 등록 (한 번만 실행하면 된다. 관리자 권한 불필요)

    powershell -NoProfile -ExecutionPolicy Bypass -File F:\Claude\WebApp_V1\deploy\register-autostart.ps1

  트리거를 두 개 건다.
    1) 로그온 30초 후 — 재부팅 복구용
    2) 10분마다 반복      — 감시용. 프로세스나 pm2 데몬이 죽어도 10분 안에 스스로 되살아난다.
       (start-hosting.ps1은 이미 떠 있으면 아무 것도 하지 않으므로 반복 실행이 안전하다)

  "사용자 로그온 시" 방식이라 재부팅 후 이 계정으로 로그인해야 서비스가 뜬다. 로그인 없이
  부팅 직후부터 띄우려면 관리자 권한이 필요하다 — deploy/README.md §2.1 참고.
#>

$ErrorActionPreference = 'Stop'

$TaskName = 'WebApp_V1-autohost'
$Script   = 'F:\Claude\WebApp_V1\deploy\start-hosting.ps1'
$User     = "$env:USERDOMAIN\$env:USERNAME"

if (-not (Test-Path $Script)) { throw "기동 스크립트를 찾을 수 없다: $Script" }

$action = New-ScheduledTaskAction `
  -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $Script)

$logon = New-ScheduledTaskTrigger -AtLogOn -User $User
$logon.Delay = 'PT30S'

# RepetitionDuration을 생략하면 '무기한 반복'이다. [TimeSpan]::MaxValue를 주면
# P99999999DT23H59M59S로 직렬화돼 작업 스케줄러가 XML을 거부한다(HRESULT 0x80041318).
$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) `
  -RepetitionInterval (New-TimeSpan -Minutes 10)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 2)

$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $logon, $watchdog `
  -Settings $settings -Principal $principal -Force `
  -Description 'WebApp_V1(demo.dove9999.com) 자동 기동/감시 — 로그온 30초 후 1회, 이후 10분마다 상태 확인. 로그: F:\Claude\WebApp_V1\data\logs\autostart.log' | Out-Null

Write-Output "등록 완료: $TaskName"
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State | Format-Table -AutoSize
