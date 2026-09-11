#!/usr/bin/env bash
# Personal Harness — installer（公开版）
#
# 目标：把三个插件装进 DSH Desktop 的 profile，让「朋友」一条命令就能用。
#
# 硬性纪律：
#   · 绝不 sudo；绝不动官方 DSH 代码；绝不删除或覆盖用户数据（projects / tasks / sessions）。
#   · 安装前必定备份 profile 的 package.json + lockfile + 当前已装插件清单；安装失败自动回滚。
#   · 只做 create-if-missing：用户已有的 registry / 设置一律保留。
#   · 兼容性未知时不静默安装：SUPPORTED 直接装，UNTESTED 需显式 --allow-untested，INCOMPATIBLE 拒绝（除非 --force）。
#
# 用法：
#   bash scripts/install.sh [--allow-untested] [--force] [--no-backup] [--dry-run]
#   DSH_PROFILE=/path/to/profile bash scripts/install.sh      # 自定义 profile
#
# 退出码：0 成功｜1 环境/兼容性拒绝｜2 安装失败（已尝试回滚）

set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRODUCT_VERSION="$(node -p "require('${REPO}/src/workstation/personal-version/product.json').version" 2>/dev/null || echo 'V1.1')"
RELEASE_TAG="public-v$(printf '%s' "${PRODUCT_VERSION}" | sed 's/^[vV]//')"
HOST_SUPPORTED="2.0.5"

ALLOW_UNTESTED=0
FORCE=0
DO_BACKUP=1
DRY_RUN=0
for arg in "$@"; do
  case "${arg}" in
    --allow-untested) ALLOW_UNTESTED=1 ;;
    --force) FORCE=1 ;;
    --no-backup) DO_BACKUP=0 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,18p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "[install] 未知参数：${arg}"; exit 1 ;;
  esac
done

say() { printf '[install] %s\n' "$1"; }
die() { printf '[install] ✗ %s\n' "$1" >&2; exit "${2:-1}"; }

# ------------------------------------------------------------------ 1. 平台
[ "$(uname -s)" = "Darwin" ] || say "注意：本发行版只在 macOS 上验证过（当前 $(uname -s)）——继续但结果未知。"
command -v node >/dev/null 2>&1 || die "缺少 node（需要 Node.js ≥ 20）"
command -v pnpm >/dev/null 2>&1 || die "缺少 pnpm —— DSH Desktop 用 pnpm 管理 profile 插件，请先安装 pnpm"

# ------------------------------------------------------------------ 2. profile 定位
PROFILE="${DSH_PROFILE:-$HOME/.dsh/profiles/desktop}"
[ -d "${PROFILE}" ] || die "找不到 DSH profile：${PROFILE}
   请确认 DSH Desktop 已安装并至少启动过一次，或用 DSH_PROFILE=/path/to/profile 指定。"
[ -f "${PROFILE}/package.json" ] || die "profile 里没有 package.json：${PROFILE}（不是有效的 DSH profile）"
say "profile：${PROFILE}"

# ------------------------------------------------------------------ 3. 兼容性门（不静默安装）
APP_PATH=""
for cand in "/Applications/DSH Desktop.app" "$HOME/Applications/DSH Desktop.app" "/Applications/DeepSeek Harness.app"; do
  [ -d "${cand}" ] && APP_PATH="${cand}" && break
done
if [ -n "${APP_PATH}" ]; then
  APP_VERSION="$(defaults read "${APP_PATH}/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo '')"
else
  APP_VERSION=""
fi
say "DSH Desktop：${APP_VERSION:-（未检测到应用包，仅按 profile 安装）}｜本发行版测试版本：${HOST_SUPPORTED}"
case "${APP_VERSION}" in
  "${HOST_SUPPORTED}") say "兼容性：SUPPORTED（与发布验证一致）" ;;
  "") if [ "${FORCE}" -eq 1 ]; then say "兼容性：UNTESTED（未检测到应用版本，--force 继续）"
      else say "兼容性：UNTESTED（未检测到应用版本）——继续请加 --allow-untested 或 --force"; [ "${ALLOW_UNTESTED}" -eq 1 ] || exit 1; fi ;;
  *) case "${APP_VERSION}" in 2.*) say "兼容性：UNTESTED（${APP_VERSION} ≠ 已测试的 ${HOST_SUPPORTED}）"
        [ "${ALLOW_UNTESTED}" -eq 1 ] || [ "${FORCE}" -eq 1 ] || { say "→ 如要继续：bash scripts/install.sh --allow-untested"; exit 1; } ;;
     *) say "兼容性：INCOMPATIBLE（${APP_VERSION}）"
        [ "${FORCE}" -eq 1 ] || { say "→ 本发行版不支持该宿主版本；如确要继续：--force"; exit 1; } ;;
  esac ;;
esac

# ------------------------------------------------------------------ 4. 发行物完整性
[ -f "${REPO}/manifest.json" ] || die "缺少 ${REPO}/manifest.json（请在发行仓库根运行）"
say "校验发行包 sha256（对照 manifest.json / checksums.sha256）…"
if ! ( cd "${REPO}" && node scripts/package-release.mjs --verify >/dev/null 2>&1 ); then
  # 没有构建产物时（朋友只拿到仓库）退化为只校验 checksums
  ( cd "${REPO}" && shasum -a 256 -c checksums.sha256 >/dev/null 2>&1 ) || die "发行包校验失败：请重新 clone 或重新下载"
  say "（未检出构建目录，已按 checksums.sha256 校验通过）"
fi
say "发行包校验通过"

# ------------------------------------------------------------------ 5. 备份（回滚点）
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/.dsh/guard-backups/personal-harness/${STAMP}"
if [ "${DRY_RUN}" -eq 1 ]; then
  # --dry-run 必须是「真的什么都不改」：不建目录、不复制、不写文件。
  say "（dry-run）跳过备份：不创建回滚点、不写任何文件（真实安装时会先备份到 ${BACKUP_DIR}）"
elif [ "${DO_BACKUP}" -eq 1 ]; then
  mkdir -p "${BACKUP_DIR}" || die "无法创建备份目录：${BACKUP_DIR}"
  cp -p "${PROFILE}/package.json" "${BACKUP_DIR}/package.json"
  for f in pnpm-lock.yaml pnpm-workspace.yaml cordis.yml cordis.patch.yml; do
    [ -f "${PROFILE}/${f}" ] && cp -p "${PROFILE}/${f}" "${BACKUP_DIR}/${f}"
  done
  # 记录当前已装的三个插件（可能是旧版本 / 未安装）
  node -e '
    const fs = require("fs")
    const p = process.argv[1]
    const pkg = JSON.parse(fs.readFileSync(p, "utf8"))
    const deps = { ...(pkg.dependencies || {}) }
    const out = {}
    for (const k of Object.keys(deps)) if (k.startsWith("dsh-personal-")) out[k] = deps[k]
    console.log(JSON.stringify(out, null, 2))
  ' "${PROFILE}/package.json" > "${BACKUP_DIR}/installed-before.json" 2>/dev/null || echo '{}' > "${BACKUP_DIR}/installed-before.json"
  say "回滚点：${BACKUP_DIR}"
else
  say "已按 --no-backup 跳过备份（不建议）"
fi

# ------------------------------------------------------------------ 6. 安装
CACHE_DIR="$HOME/.dsh/cache"
PKGS="$(cd "${REPO}" && ls packages/*.tgz 2>/dev/null | sed 's|packages/||')" || true
[ -n "${PKGS}" ] || die "packages/ 下没有 tgz —— 先在仓库根跑 npm install && npm run build && npm run package"
if [ "${DRY_RUN}" -eq 1 ]; then
  say "（dry-run）将把 $(printf '%s\n' ${PKGS} | wc -l | tr -d ' ') 个 tgz 复制到 ${CACHE_DIR}（本次未复制）"
else
  mkdir -p "${CACHE_DIR}" || die "无法创建缓存目录：${CACHE_DIR}"
  for f in ${PKGS}; do cp -f "${REPO}/packages/${f}" "${CACHE_DIR}/${f}"; done
  say "安装包已放入 ${CACHE_DIR}"
fi

install_one() {
  name="$1"
  spec="file:${CACHE_DIR}/${name}"
  if [ "${DRY_RUN}" -eq 1 ]; then say "（dry-run）将要执行：pnpm add ${spec}"; return 0; fi
  ( cd "${PROFILE}" && pnpm add "${spec}" --silent ) || return 1
}

FAILED=0
for f in ${PKGS}; do
  say "安装 ${f} …"
  install_one "${f}" || { FAILED=1; say "✗ 安装失败：${f}"; break; }
done

rollback_now() {
  say "安装失败 → 回滚到安装前状态（${BACKUP_DIR}）"
  [ -f "${BACKUP_DIR}/package.json" ] || { say "✗ 没有可用备份，请手动检查 profile"; return 1; }
  cp -f "${BACKUP_DIR}/package.json" "${PROFILE}/package.json"
  for f in pnpm-lock.yaml pnpm-workspace.yaml; do
    [ -f "${BACKUP_DIR}/${f}" ] && cp -f "${BACKUP_DIR}/${f}" "${PROFILE}/${f}"
  done
  ( cd "${PROFILE}" && pnpm install --silent ) || say "（回滚后 pnpm install 未成功，请运行 bash scripts/rollback.sh）"
  say "已回滚；官方 DSH 功能不受影响"
}

if [ "${FAILED}" -eq 1 ]; then
  [ "${DO_BACKUP}" -eq 1 ] && rollback_now
  exit 2
fi

# ------------------------------------------------------------------ 7. 逐字节核对
if [ "${DRY_RUN}" -eq 0 ]; then
  say "核对装机字节（profile 内 client.js vs 发行包）…"
  node - "${REPO}" "${PROFILE}" <<'NODE' || die "装机字节核对失败：请运行 bash scripts/rollback.sh 并反馈" 2
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const [repo, profile] = process.argv.slice(2)
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'manifest.json'), 'utf8'))
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
let bad = 0
for (const p of manifest.plugins) {
  const installed = path.join(profile, 'node_modules', p.name, 'client.js')
  if (!fs.existsSync(installed)) { console.log(`  ✗ ${p.name}: 未在 profile 中找到 client.js`); bad++; continue }
  const got = sha(installed)
  if (got === p.clientJsSha256) console.log(`  ✓ ${p.name}@${p.componentVersion} 逐字节一致（${got.slice(0, 16)}…）`)
  else { console.log(`  ✗ ${p.name}: 装机=${got.slice(0, 16)}… 期望=${p.clientJsSha256.slice(0, 16)}…`); bad++ }
}
process.exit(bad === 0 ? 0 : 1)
NODE
fi

if [ "${DRY_RUN}" -eq 1 ]; then
  HEADER="[install] ✓ dry-run 结束：以上是「将要发生的事」——本次没有备份、没有复制、没有安装、没有改动任何文件"
  WHAT="将要安装"
else
  HEADER="[install] ✓ 安装完成"
  WHAT="已安装"
fi

cat <<EOF

${HEADER}
  ${WHAT}：$(echo ${PKGS} | tr "\n" " ")
  组件版本：$(node -p "require('${REPO}/manifest.json').plugins.map(p=>p.name.replace('dsh-personal-','')+' '+p.componentVersion).join(' / ')" 2>/dev/null)

  下一步（重要）：**完全退出 DSH Desktop 再重新打开**（插件在启动时加载）。
  打开后应看到：左侧 Personal Harness 导航（主页 / 会话 / 新任务 / 任务看板 / 项目 / 工作区 / 最近）与底部 HUD。

  卸载：bash scripts/uninstall.sh
  回滚：bash scripts/rollback.sh $([ "${DO_BACKUP}" -eq 1 ] && echo "${BACKUP_DIR}")
  自检：cd "${REPO}" && npm run verify
EOF
