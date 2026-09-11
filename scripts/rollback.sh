#!/usr/bin/env bash
# Personal Harness — rollback（公开版）
#
# 把 DSH profile 恢复到某次安装前的状态（install.sh 每次安装都会创建回滚点）。
#
# 用法：
#   bash scripts/rollback.sh                    # 使用最新回滚点
#   bash scripts/rollback.sh <备份目录>          # 指定回滚点
#   bash scripts/rollback.sh --list             # 列出可用回滚点
#   DSH_PROFILE=/path/to/profile bash scripts/rollback.sh
#
# 回滚做什么：恢复 profile 的 package.json / pnpm-lock.yaml / pnpm-workspace.yaml，然后 pnpm install。
# 不做什么：不动用户数据（会话 / 任务 / 项目 / 工作区）。

set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="$HOME/.dsh/guard-backups/personal-harness"
PROFILE="${DSH_PROFILE:-$HOME/.dsh/profiles/desktop}"

say() { printf '[rollback] %s\n' "$1"; }
die() { printf '[rollback] ✗ %s\n' "$1" >&2; exit "${2:-1}"; }

case "${1:-}" in
  -h|--help) sed -n '2,15p' "${BASH_SOURCE[0]}"; exit 0 ;;
  --list)
    if [ -d "${BACKUP_ROOT}" ]; then ls -1t "${BACKUP_ROOT}"; else say "没有任何回滚点（${BACKUP_ROOT} 不存在）"; fi
    exit 0
    ;;
esac

TARGET="${1:-}"
if [ -z "${TARGET}" ]; then
  [ -d "${BACKUP_ROOT}" ] || die "没有任何回滚点：${BACKUP_ROOT}
   （回滚点由 scripts/install.sh 在安装前自动创建；若从未安装过，无需回滚）"
  TARGET="$(ls -1t "${BACKUP_ROOT}" | head -1)"
  [ -n "${TARGET}" ] || die "回滚点目录为空：${BACKUP_ROOT}"
  TARGET="${BACKUP_ROOT}/${TARGET}"
fi
[ -d "${TARGET}" ] || die "回滚点不存在：${TARGET}"
[ -f "${TARGET}/package.json" ] || die "回滚点不完整（缺 package.json）：${TARGET}"
[ -d "${PROFILE}" ] || die "找不到 DSH profile：${PROFILE}"
command -v pnpm >/dev/null 2>&1 || die "缺少 pnpm"

say "使用回滚点：${TARGET}"
say "目标 profile：${PROFILE}"

# 回滚本身也要留后路：先把「当前」状态存一份
SAFETY="$HOME/.dsh/guard-backups/personal-harness/$(date +%Y%m%d-%H%M%S)-before-rollback"
mkdir -p "${SAFETY}" && cp -p "${PROFILE}/package.json" "${SAFETY}/package.json" 2>/dev/null || true
for f in pnpm-lock.yaml pnpm-workspace.yaml; do
  [ -f "${PROFILE}/${f}" ] && cp -p "${PROFILE}/${f}" "${SAFETY}/${f}"
done
say "当前状态已另存：${SAFETY}"

say "恢复 phase 1/2：profile 清单文件"
cp -f "${TARGET}/package.json" "${PROFILE}/package.json"
for f in pnpm-lock.yaml pnpm-workspace.yaml; do
  if [ -f "${TARGET}/${f}" ]; then cp -f "${TARGET}/${f}" "${PROFILE}/${f}"; say "  已恢复 ${f}";
  else say "  回滚点没有 ${f}（安装时该文件不存在）→ 保持现状"; fi
done

say "恢复 phase 2/2：pnpm install（按恢复后的清单重算依赖）"
if ! ( cd "${PROFILE}" && pnpm install --silent ); then
  die "pnpm install 失败 —— profile 清单已恢复，但依赖树可能不一致。请手动执行：
     cd ${PROFILE} && pnpm install
   或从 ${SAFETY} 恢复（那是回滚前的状态）。" 2
fi

# 核对：回滚后 Personal Harness 是否已按备份状态消失/回退
say "核对："
REMAIN=0
for p in dsh-personal-sidebar dsh-personal-workspace dsh-personal-hud; do
  if [ -d "${PROFILE}/node_modules/${p}" ]; then
    V="$(node -p "require('${PROFILE}/node_modules/${p}/package.json').version" 2>/dev/null || echo '?')"
    say "  · ${p} 仍存在（版本 ${V}）—— 说明回滚点里它本来就在"
  else
    say "  · ${p} 已移除"
  fi
done
node -e "const p=require('${PROFILE}/package.json');const d=p.dependencies||{};const k=Object.keys(d).filter(x=>x.startsWith('dsh-personal-'));console.log('[rollback]   profile 依赖声明:', k.length? k.map(x=>x+'@'+d[x]).join(', ') : '（无 Personal Harness）')" 2>/dev/null || true

cat <<EOF

[rollback] ✓ 回滚流程结束
  下一步：**完全退出 DSH Desktop 再重新打开**，确认界面符合预期。
  若结果不对：可从 ${SAFETY} 再回滚一次（那是回滚前的状态）。
  用户数据未被触碰。
EOF
