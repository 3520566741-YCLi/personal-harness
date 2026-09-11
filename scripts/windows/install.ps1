<#
  Personal Harness — Windows Experimental / 未验证版 · installer

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

  设计纪律（与 macOS 版一致）：
    · 绝不要求管理员权限；绝不动官方 DSH 代码；绝不删除或覆盖用户数据（会话 / 任务 / 项目 / 工作区）。
    · 安装前必定备份 profile 的 package.json + lockfile + 当前已装插件清单；安装失败自动回滚。
    · 只做 create-if-missing：用户已有的 registry / 设置一律保留。
    · 兼容性无法可靠确认时**不静默安装**：必须先显式确认（-AllowUntested）。

  用法（在 PowerShell 中）：
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\install.ps1 -DryRun      # 先看它要做什么
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\install.ps1              # 安装
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\install.ps1 -AllowUntested
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\install.ps1 -Profile "D:\dsh\profiles\desktop"

  退出码：0 成功｜1 环境 / 兼容性拒绝｜2 安装失败（已尝试回滚）
#>
[CmdletBinding()]
param(
  [string]$Profile = $env:DSH_PROFILE,
  [switch]$AllowUntested,
  [switch]$Force,
  [switch]$NoBackup,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$HostTested = '2.0.5'

# 用户主目录：Windows 用 USERPROFILE；若缺失（Git Bash / 其它环境）回退到 HOME 或系统 API。
$HomeDir = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { [Environment]::GetFolderPath('UserProfile') }          # 本发行版唯一验证过的宿主版本（macOS 上验证；Windows 未验证）

function Say([string]$m) { Write-Host "[install] $m" }
function Die([string]$m, [int]$code = 1) { Write-Host "[install] x $m" -ForegroundColor Red; exit $code }

function Write-Warning-Block {
  Write-Host ''
  Write-Host '  ==========================================================================' -ForegroundColor Yellow
  Write-Host '  Windows Experimental / 未验证版' -ForegroundColor Yellow
  Write-Host ''
  Write-Host '  此版本尚未在真实 Windows DSH Desktop 环境完成安装、界面、卸载与回滚验证。'
  Write-Host '  插件核心使用 web 平台接口，理论上可能兼容；但 DSH Desktop 的 Windows 版本、'
  Write-Host '  profile 路径、扩展接口和 pnpm 行为可能不同。'
  Write-Host ''
  Write-Host '  你可能需要根据自己安装的 DeepSeek Harness / DSH Desktop 实际情况修改路径、'
  Write-Host '  脚本或配置后才能使用。'
  Write-Host '  不能保证 clone 后可直接安装，也不能保证与所有 Windows 版本兼容。'
  Write-Host ''
  Write-Host '  请先备份自己的 DSH profile；如出现问题，请停止并恢复备份。'
  Write-Host '  ==========================================================================' -ForegroundColor Yellow
  Write-Host ''
}

$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # 仓库根（scripts/windows → 仓库根）
Set-Location $Repo

Write-Warning-Block

# ------------------------------------------------------------------ 1. 环境
Say "操作系统：$([System.Environment]::OSVersion.VersionString)（本脚本面向 Windows，未在 Windows 上验证）"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Die '缺少 node（需要 Node.js >= 20）—— 安装后重开 PowerShell' }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { Die '缺少 pnpm —— DSH Desktop 用 pnpm 管理 profile 插件，请先安装 pnpm' }
Say "node $(node --version) / pnpm $(pnpm --version)"

$isElevated = $false
try { $isElevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) } catch { $isElevated = $false }
if ($isElevated) { Say '提示：当前 PowerShell 以管理员身份运行。本脚本不需要管理员权限 —— 建议改用普通 PowerShell 重跑。' }

# ------------------------------------------------------------------ 2. profile 定位（不做假设：逐个候选 + 显式参数优先）
function Resolve-Profile([string]$explicit) {
  if ($explicit) { return $explicit }
  $candidates = @()
  $candidates += (Join-Path $HomeDir '.dsh\profiles\desktop')
  if ($env:APPDATA) { $candidates += (Join-Path $env:APPDATA '.dsh\profiles\desktop') }
  if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA '.dsh\profiles\desktop') }
  if ($env:HOME) { $candidates += (Join-Path $env:HOME '.dsh/profiles/desktop') }
  foreach ($c in $candidates) { if ($c -and (Test-Path (Join-Path $c 'package.json'))) { return $c } }
  return $null
}

$Profile = Resolve-Profile $Profile
if (-not $Profile) {
  Die @"
找不到 DSH profile。请在 PowerShell 里确认你的 DSH Desktop 数据目录，然后显式指定：
    .\scripts\windows\install.ps1 -Profile "C:\Users\<你>\.dsh\profiles\desktop"
常见位置：%USERPROFILE%\.dsh\profiles\desktop
"@
}
$Profile = (Resolve-Path $Profile).Path
if (-not (Test-Path (Join-Path $Profile 'package.json'))) { Die "profile 里没有 package.json：$Profile（不是有效的 DSH profile）" }
Say "profile：$Profile"

# ------------------------------------------------------------------ 3. 兼容性门（不静默安装）
$appVersion = $null
$appHits = @()
foreach ($root in @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)}, $HomeDir)) {
  if (-not $root) { continue }
  foreach ($name in @('DSH Desktop', 'DeepSeek Harness', 'dsh-desktop')) {
    $p = Join-Path $root $name
    if (Test-Path $p) { $appHits += $p }
  }
}
if ($appHits.Count -gt 0) {
  Say "检测到可能的 DSH Desktop 安装位置：$($appHits -join '; ')"
  Say '（无法可靠读取 Windows 版 DSH Desktop 的版本号 —— 版本判定按 UNTESTED 处理）'
} else {
  Say '未检测到 DSH Desktop 安装位置（仅按 profile 安装）'
}
$compat = 'UNTESTED'
Say "兼容性：$compat（本发行版只在 macOS + DSH Desktop $HostTested 上验证过；Windows 未验证）"
if (-not ($AllowUntested -or $Force)) {
  Write-Host ''
  Write-Host '  UNTESTED — continue only with explicit user confirmation' -ForegroundColor Yellow
  Write-Host '  如确认要继续，请加 -AllowUntested（例如：-AllowUntested）'
  exit 1
}
Say '已获得显式确认（-AllowUntested / -Force）→ 继续'

# ------------------------------------------------------------------ 4. 发行物完整性
$manifestPath = Join-Path $Repo 'manifest.json'
if (-not (Test-Path $manifestPath)) { Die "缺少 $manifestPath（请在发行仓库根运行）" }
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
Say '校验发行包 sha256（对照 manifest.json / checksums.sha256）...'
foreach ($p in $manifest.plugins) {
  $tgz = Join-Path $Repo $p.tgz
  if (-not (Test-Path $tgz)) { Die "缺包：$($p.tgz)" }
  $got = (Get-FileHash -Algorithm SHA256 $tgz).Hash.ToLower()
  if ($got -ne $p.tgzSha256) { Die "包哈希不符：$($p.tgz)`n  实测=$got`n  期望=$($p.tgzSha256)`n（重新获取该仓库，或不要安装被修改过的包）" }
  Say "  ok  $($p.tgz) sha256 一致"
}

# ------------------------------------------------------------------ 5. 备份（回滚点）
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $HomeDir '.dsh\guard-backups\personal-harness'
$backupDir = Join-Path $backupRoot $stamp
$didBackup = $false
if ($DryRun) {
  # -DryRun 必须是「真的什么都不改」：不建目录、不复制、不写文件。
  Say "（dry-run）跳过备份：不创建回滚点、不写任何文件（真实安装时会先备份到 $backupDir）"
} elseif (-not $NoBackup) {
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  Copy-Item (Join-Path $Profile 'package.json') (Join-Path $backupDir 'package.json') -Force
  foreach ($f in @('pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.yml', 'cordis.patch.yml')) {
    $src = Join-Path $Profile $f
    if (Test-Path $src) { Copy-Item $src (Join-Path $backupDir $f) -Force }
  }
  $pkg = Get-Content (Join-Path $Profile 'package.json') -Raw | ConvertFrom-Json
  $before = @{}
  if ($pkg.dependencies) {
    foreach ($d in $pkg.dependencies.PSObject.Properties) { if ($d.Name -like 'dsh-personal-*') { $before[$d.Name] = $d.Value } }
  }
  ($before | ConvertTo-Json -Depth 5) | Set-Content (Join-Path $backupDir 'installed-before.json') -Encoding UTF8
  $didBackup = $true
  Say "回滚点：$backupDir"
} else {
  Say '已按 -NoBackup 跳过备份（不建议）'
}

# ------------------------------------------------------------------ 6. 安装
$cacheDir = Join-Path $HomeDir '.dsh\cache'
$tgzs = Get-ChildItem (Join-Path $Repo 'packages') -Filter '*.tgz' -ErrorAction SilentlyContinue
if (-not $tgzs -or $tgzs.Count -eq 0) { Die "packages\ 下没有 tgz —— 先在仓库根跑 npm install && npm run build && npm run package" }
if ($DryRun) {
  Say "（dry-run）将把 $($tgzs.Count) 个 tgz 复制到 $cacheDir（本次未复制）"
} else {
  New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
  foreach ($t in $tgzs) { Copy-Item $t.FullName (Join-Path $cacheDir $t.Name) -Force }
  Say "安装包已放入 $cacheDir"
}

function Install-One([string]$name) {
  $spec = "file:$cacheDir\$name" -replace '\\', '/'
  if ($DryRun) { Say "（dry-run）将要执行：pnpm add $spec"; return $true }
  Push-Location $Profile
  try { & pnpm add $spec 2>&1 | Out-Null; return ($LASTEXITCODE -eq 0) }
  finally { Pop-Location }
}

function Invoke-Rollback {
  Say "安装失败 → 回滚到安装前状态（$backupDir）"
  if (-not (Test-Path (Join-Path $backupDir 'package.json'))) { Say 'x 没有可用备份，请手动检查 profile'; return $false }
  Copy-Item (Join-Path $backupDir 'package.json') (Join-Path $Profile 'package.json') -Force
  foreach ($f in @('pnpm-lock.yaml', 'pnpm-workspace.yaml')) {
    if (Test-Path (Join-Path $backupDir $f)) { Copy-Item (Join-Path $backupDir $f) (Join-Path $Profile $f) -Force }
  }
  Push-Location $Profile
  try { & pnpm install 2>&1 | Out-Null } finally { Pop-Location }
  Say '已回滚；官方 DSH 功能不受影响'
  return $true
}

$failed = $false
foreach ($t in $tgzs) {
  Say "安装 $($t.Name) ..."
  if (-not (Install-One $t.Name)) { $failed = $true; Say "x 安装失败：$($t.Name)"; break }
}
if ($failed) { if ($didBackup) { Invoke-Rollback | Out-Null }; exit 2 }

# ------------------------------------------------------------------ 7. 逐字节核对
if (-not $DryRun) {
  Say '核对装机字节（profile 内 client.js vs 发行包）...'
  $bad = 0
  foreach ($p in $manifest.plugins) {
    $installed = Join-Path $Profile "node_modules\$($p.name)\client.js"
    if (-not (Test-Path $installed)) { Write-Host "  x $($p.name)：未在 profile 中找到 client.js"; $bad++; continue }
    $got = (Get-FileHash -Algorithm SHA256 $installed).Hash.ToLower()
    if ($got -eq $p.clientJsSha256) { Write-Host "  ok  $($p.name)@$($p.componentVersion) 逐字节一致（$($got.Substring(0,16))...）" }
    else { Write-Host "  x $($p.name)：装机=$($got.Substring(0,16))... 期望=$($p.clientJsSha256.Substring(0,16))..."; $bad++ }
  }
  if ($bad -gt 0) { Die '装机字节核对失败：请运行 .\scripts\windows\rollback.ps1 并反馈' 2 }
}

Write-Host ''
if ($DryRun) { Say 'dry-run 结束：以上是「将要发生的事」——本次没有备份、没有复制、没有安装、没有改动任何文件' }
else { Say '安装完成' }
Say "已安装：$(($tgzs | ForEach-Object { $_.Name }) -join ' ')"
Say '下一步（重要）：完全退出 DSH Desktop 再重新打开（插件在启动时加载）。'
Say "卸载：powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall.ps1"
if ($didBackup) { Say "回滚：powershell -ExecutionPolicy Bypass -File .\scripts\windows\rollback.ps1 -Backup `"$backupDir`"" }
Write-Host ''
Write-Host '  提醒：Windows 版为 Experimental / 未验证版。若界面异常，请回滚并反馈（附 PowerShell 完整输出）。' -ForegroundColor Yellow
exit 0
