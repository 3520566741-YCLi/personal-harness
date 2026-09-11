<#
  Personal Harness — Windows Experimental / 未验证版 · rollback

  ============================================================================
  Windows Experimental / 未验证版

  此版本尚未在真实 Windows DSH Desktop 环境完成安装、界面、卸载与回滚验证。
  插件核心使用 web 平台接口，理论上可能兼容；但 DSH Desktop 的 Windows 版本、
  profile 路径、扩展接口和 pnpm 行为可能不同。

  你可能需要根据自己安装的 DeepSeek Harness / DSH Desktop 实际情况修改路径、
  脚本或配置后才能使用。
  不能保证 clone 后可直接安装，也不能保证与所有 Windows 版本兼容。

  请先备份自己的 DSH profile；如出现问题，请停止并恢复备份。
  ============================================================================

  把 DSH profile 恢复到某次安装前的状态（install.ps1 每次安装都会创建回滚点）。

  用法（在 PowerShell 中）：
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\rollback.ps1 -List
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\rollback.ps1
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\rollback.ps1 -Backup "C:\Users\<你>\.dsh\guard-backups\personal-harness\20260912-101500"
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\rollback.ps1 -Profile "D:\dsh\profiles\desktop"

  退出码：0 成功｜1 环境错误（找不到回滚点 / profile / pnpm）｜2 清单已恢复但 pnpm install 失败
#>
[CmdletBinding()]
param(
  [string]$Profile = $env:DSH_PROFILE,
  [string]$Backup,
  [switch]$List
)

$ErrorActionPreference = 'Stop'
$Plugins = @('dsh-personal-sidebar', 'dsh-personal-workspace', 'dsh-personal-hud')
$HomeDir = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { [Environment]::GetFolderPath('UserProfile') }
$BackupRoot = Join-Path $HomeDir '.dsh\guard-backups\personal-harness'

function Say([string]$m) { Write-Host "[rollback] $m" }
function Die([string]$m, [int]$code = 1) { Write-Host "[rollback] x $m" -ForegroundColor Red; exit $code }

Write-Host ''
Write-Host '  提醒：Windows 版为 Experimental / 未验证版（未在真实 Windows DSH Desktop 上验证）。' -ForegroundColor Yellow
Write-Host ''

if ($List) {
  if (Test-Path $BackupRoot) {
    Get-ChildItem $BackupRoot -Directory | Sort-Object Name -Descending | ForEach-Object { Write-Host $_.Name }
  } else {
    Say "没有任何回滚点（$BackupRoot 不存在）"
  }
  exit 0
}

if (-not $Profile) {
  $cand = Join-Path $HomeDir '.dsh\profiles\desktop'
  if (Test-Path (Join-Path $cand 'package.json')) { $Profile = $cand }
}
if (-not $Profile) { Die '找不到 DSH profile —— 请用 -Profile "<你的 profile 路径>" 指定' }
$Profile = (Resolve-Path $Profile).Path
if (-not (Test-Path $Profile)) { Die "找不到 DSH profile：$Profile" }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { Die '缺少 pnpm' }

if (-not $Backup) {
  if (-not (Test-Path $BackupRoot)) { Die "没有任何回滚点：$BackupRoot`n   （回滚点由 install.ps1 在安装前自动创建；若从未安装过，无需回滚）" }
  $latest = Get-ChildItem $BackupRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $latest) { Die "回滚点目录为空：$BackupRoot" }
  $Backup = $latest.FullName
}
if (-not (Test-Path $Backup)) { Die "回滚点不存在：$Backup" }
if (-not (Test-Path (Join-Path $Backup 'package.json'))) { Die "回滚点不完整（缺 package.json）：$Backup" }

Say "使用回滚点：$Backup"
Say "目标 profile：$Profile"

# 回滚本身也要留后路：先把「当前」状态存一份
$safety = Join-Path $BackupRoot "$(Get-Date -Format 'yyyyMMdd-HHmmss')-before-rollback"
New-Item -ItemType Directory -Force -Path $safety | Out-Null
Copy-Item (Join-Path $Profile 'package.json') (Join-Path $safety 'package.json') -Force -ErrorAction SilentlyContinue
foreach ($f in @('pnpm-lock.yaml', 'pnpm-workspace.yaml')) {
  if (Test-Path (Join-Path $Profile $f)) { Copy-Item (Join-Path $Profile $f) (Join-Path $safety $f) -Force }
}
Say "当前状态已另存：$safety"

Say '恢复 phase 1/2：profile 清单文件'
Copy-Item (Join-Path $Backup 'package.json') (Join-Path $Profile 'package.json') -Force
foreach ($f in @('pnpm-lock.yaml', 'pnpm-workspace.yaml')) {
  if (Test-Path (Join-Path $Backup $f)) {
    Copy-Item (Join-Path $Backup $f) (Join-Path $Profile $f) -Force
    Say "  已恢复 $f"
  } else {
    Say "  回滚点没有 $f（安装时该文件不存在）→ 保持现状"
  }
}

Say '恢复 phase 2/2：pnpm install（按恢复后的清单重算依赖）'
Push-Location $Profile
try { & pnpm install 2>&1 | Out-Null; $ok = ($LASTEXITCODE -eq 0) } finally { Pop-Location }
if (-not $ok) {
  Die "pnpm install 失败 —— profile 清单已恢复，但依赖树可能不一致。请手动执行：`n     cd `"$Profile`"; pnpm install`n   或从 $safety 恢复（那是回滚前的状态）。" 2
}

Say '核对：'
foreach ($p in $Plugins) {
  $dir = Join-Path $Profile "node_modules\$p"
  if (Test-Path $dir) { Say "  · $p 仍存在 —— 说明回滚点里它本来就在" } else { Say "  · $p 已移除" }
}
$pkg = Get-Content (Join-Path $Profile 'package.json') -Raw | ConvertFrom-Json
$declared = @()
if ($pkg.dependencies) { foreach ($d in $pkg.dependencies.PSObject.Properties) { if ($d.Name -like 'dsh-personal-*') { $declared += "$($d.Name)@$($d.Value)" } } }
Say ("  profile 依赖声明：" + $(if ($declared.Count) { $declared -join ', ' } else { '（无 Personal Harness）' }))

Write-Host ''
Say '回滚流程结束'
Say '下一步：完全退出 DSH Desktop 再重新打开，确认界面符合预期。'
Say "若结果不对：可从 $safety 再回滚一次（那是回滚前的状态）。"
Say '用户数据未被触碰。'
exit 0
