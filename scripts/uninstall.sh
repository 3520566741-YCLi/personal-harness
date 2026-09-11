#!/usr/bin/env bash
# Personal Harness — uninstaller（公开版）
#
# 只移除 Personal Harness 自己安装的三个插件；**默认完整保留用户数据**
# （projects / tasks / sessions / workspaces 全部属于 DSH 官方存储，本发行版不拥有它们）。
#
# 用法：
#   bash scripts/uninstall.sh                 # 卸载插件，保留数据
#   bash scripts/uninstall.sh --purge-user-data   # 卸载插件 + 删除本发行版**自己**写下的磁盘状态
#   DSH_PROFILE=/path/to/profile bash scripts/uninstall.sh
#
# 退出码：0 成功｜1 环境错误｜2 卸载后仍能检测到插件（未完成）

set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGINS="dsh-personal-sidebar dsh-personal-workspace dsh-personal-hud"
PURGE=0
for arg in "$@"; do
  case "${arg}" in
    --purge-user-data) PURGE=1 ;;
    -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "[uninstall] 未知参数：${arg}"; exit 1 ;;
  esac
done

say() { printf '[uninstall] %s\n' "$1"; }
die() { printf '[uninstall] ✗ %s\n' "$1" >&2; exit "${2:-1}"; }

PROFILE="${DSH_PROFILE:-$HOME/.dsh/profiles/desktop}"
[ -d "${PROFILE}" ] || die "找不到 DSH profile：${PROFILE}"
command -v pnpm >/dev/null 2>&1 || die "缺少 pnpm"

say "profile：${PROFILE}"
say "将移除：${PLUGINS}"

for p in ${PLUGINS}; do
  if ( cd "${PROFILE}" && pnpm remove "${p}" --silent ) ; then
    say "已移除 ${p}"
  else
    say "跳过 ${p}（未安装或移除失败）"
  fi
done

# 残留检查
LEFT=0
for p in ${PLUGINS}; do
  [ -d "${PROFILE}/node_modules/${p}" ] && { say "✗ 仍存在：${PROFILE}/node_modules/${p}"; LEFT=1; }
done

if [ "${PURGE}" -eq 1 ]; then
  cat <<EOF

[uninstall] --purge-user-data 已请求。这一步**只**处理本发行版自己在磁盘上写下的东西：

  将删除：
    · $HOME/.dsh/guard-backups/personal-harness/     （安装时创建的回滚点）
    · $HOME/.dsh/cache/dsh-personal-*-public-v*.tgz  （安装时放入的发行包缓存）
    · $HOME/.dsh/.personal/                          （仅在存在时；本发行版不写入官方存储）

  **不会**删除（属于 DSH 官方存储，也是你的数据）：
    · $HOME/.dsh/profiles/desktop/node_modules/**/  官方插件与其它第三方插件
    · $HOME/.dsh/profiles/desktop/storages/**       会话 / 任务 / 工作区数据
    · $HOME/.dsh/sessions/**                        会话落盘

  另需在应用内自行清理（脚本无法安全代劳，因为那是运行中的浏览器存储）：
    打开 DSH Desktop → Personal Harness 的 Inspector → 「重置本地状态」；
    或在「项目 / 任务」界面逐个删除；键名前缀为 dsh.personal.* 与 dsh.dps.*。
EOF

  printf '[uninstall] 确认请输入大写 PURGE：'
  read -r CONFIRM || CONFIRM=""
  if [ "${CONFIRM}" != "PURGE" ]; then
    say "未确认 → 已取消 purge（插件卸载已完成，数据保持原样）"
  else
    rm -rf "$HOME/.dsh/guard-backups/personal-harness" && say "已删除回滚点目录"
    rm -f "$HOME"/.dsh/cache/dsh-personal-*-public-v*.tgz 2>/dev/null && say "已删除发行包缓存" || true
    if [ -d "$HOME/.dsh/.personal" ]; then
      rm -rf "$HOME/.dsh/.personal" && say "已删除 $HOME/.dsh/.personal"
    else
      say "$HOME/.dsh/.personal 不存在（无需处理）"
    fi
    say "purge 完成：官方存储与会话数据未被触碰"
  fi
fi

cat <<EOF

[uninstall] ✓ 卸载流程结束
  下一步：**完全退出 DSH Desktop 再重新打开** —— 官方界面应恢复原样（个人导航与 HUD 消失）。
  用户数据（会话 / 任务 / 项目 / 工作区）未被删除；重新运行 scripts/install.sh 即可恢复 Personal Harness。
  如需回滚到某个历史状态：bash scripts/rollback.sh <备份目录>
EOF
exit "${LEFT}"
