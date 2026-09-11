<#
  Personal Harness — Windows Experimental / 未验证版 · uninstaller

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

  只移除 Personal Harness 自己安装的三个插件；**默认完整保留用户数据**
  （会话 / 任务 / 项目 / 工作区全部属于 DSH 官方存储，本发行版不拥有它们）。

  用法（在 PowerShell 中）：
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall.ps1
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall.ps1 -PurgeUserData
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall.ps1 -Profile "D:\dsh\profiles\desktop"

  退出码：0 成功｜1 环境错误｜2 卸载后仍能检测到插件（未完成）
#>
[CmdletBinding()]
param(
  [string]$Profile = $env:DSH_PROFILE,
  [switch]$PurgeUserData
)

$ErrorActionPreference = 'Stop'
$Plugins = @('dsh-personal-sidebar', 'dsh-personal-workspace', 'dsh-personal-hud')
$HomeDir = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { [Environment]::GetFolderPath('UserProfile') }

function Say([string]$m) { Write-Host "[uninstall] $m" }
function Die([string]$m, [int]$code = 1) { Write-Host "[uninstall] x $m" -ForegroundColor Red; exit $code }

Write-Host ''
Write-Host '  提醒：Windows 版为 Experimental / 未验证版（未在真实 Windows DSH Desktop 上验证）。' -ForegroundColor Yellow
Write-Host ''

if (-not $Profile) {
  $cand = Join-Path $HomeDir '.dsh\profiles\desktop'
  if (Test-Path (Join-Path $cand 'package.json')) { $Profile = $cand }
}
if (-not $Profile) { Die '找不到 DSH profile —— 请用 -Profile "<你的 profile 路径>" 指定' }
$Profile = (Resolve-Path $Profile).Path
if (-not (Test-Path $Profile)) { Die "找不到 DSH profile：$Profile" }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { Die '缺少 pnpm' }

Say "profile：$Profile"
Say "将移除：$($Plugins -join ', ')"

foreach ($p in $Plugins) {
  Push-Location $Profile
  try {
    & pnpm remove $p 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Say "已移除 $p" } else { Say "跳过 $p（未安装或移除失败）" }
  } finally { Pop-Location }
}

# 残留检查
$left = 0
foreach ($p in $Plugins) {
  $dir = Join-Path $Profile "node_modules\$p"
  if (Test-Path $dir) { Say "x 仍存在：$dir"; $left = 1 }
}

if ($PurgeUserData) {
  $backupRoot = Join-Path $HomeDir '.dsh\guard-backups\personal-harness'
  $cacheGlob = Join-Path $HomeDir '.dsh\cache'
  $personalDir = Join-Path $HomeDir '.dsh\.personal'
  Write-Host ''
  Say '-PurgeUserData 已请求。这一步**只**处理本发行版自己在磁盘上写下的东西：'
  Say "  将删除："
  Say "    · $backupRoot\            （安装时创建的回滚点）"
  Say "    · $cacheGlob\dsh-personal-*-public-v*.tgz   （安装时放入的发行包缓存）"
  Say "    · $personalDir\           （仅在存在时；本发行版不写入官方存储）"
  Say '  **不会**删除（属于 DSH 官方存储，也是你的数据）：'
  Say "    · $Profile\node_modules\**          官方插件与其它第三方插件"
  Say "    · $Profile\storages\**              会话 / 任务 / 工作区数据"
  Say "    · $HomeDir\.dsh\sessions\**          会话落盘"
  Say '  另需在应用内自行清理（脚本无法安全代劳，因为那是运行中的浏览器存储）：'
  Say '    打开 DSH Desktop → Personal Harness 的 Inspector → 「重置本地状态」；'
  Say '    或在「项目 / 任务」界面逐个删除；键名前缀为 dsh.personal.* 与 dsh.dps.*'
  Write-Host ''
  $confirm = Read-Host '[uninstall] 确认请输入大写 PURGE'
  if ($confirm -ne 'PURGE') {
    Say '未确认 → 已取消 purge（插件卸载已完成，数据保持原样）'
  } else {
    if (Test-Path $backupRoot) { Remove-Item -Recurse -Force $backupRoot; Say '已删除回滚点目录' }
    Get-ChildItem (Join-Path $HomeDir '.dsh\cache') -Filter 'dsh-personal-*-public-v*.tgz' -ErrorAction SilentlyContinue |
      ForEach-Object { Remove-Item $_.FullName -Force }
    Say '已删除发行包缓存（若存在）'
    if (Test-Path $personalDir) { Remove-Item -Recurse -Force $personalDir; Say "已删除 $personalDir" } else { Say "$personalDir 不存在（无需处理）" }
    Say 'purge 完成：官方存储与会话数据未被触碰'
  }
}

Write-Host ''
Say '卸载流程结束'
Say '下一步：完全退出 DSH Desktop 再重新打开 —— 官方界面应恢复原样。'
Say '用户数据（会话 / 任务 / 项目 / 工作区）未被删除；重新运行 install.ps1 即可恢复 Personal Harness。'
exit $left
