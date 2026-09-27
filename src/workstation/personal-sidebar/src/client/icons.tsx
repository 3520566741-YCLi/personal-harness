// dsh-personal-sidebar — inline SVG icons (no third-party icon dependency).
import type { JSX, SVGProps } from 'react'

interface IconProps {
  size?: number
}

function base(size: number): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
}

export function WorkspaceIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  )
}

export function ChatIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M2.5 3h11v8h-7l-3.5 2.5V3Z" />
    </svg>
  )
}

export function SwitcherIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M4 10V4.5M4 4.5 2.2 6M4 4.5 5.8 6" />
      <path d="M12 6v5.5M12 11.5l1.8-1.5M12 11.5l-1.8-1.5" />
    </svg>
  )
}

export function BackIcon({ size = 12 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M10 3 5 8l5 5" />
    </svg>
  )
}

export function PlusIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

export function HomeIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M2.8 7.2 8 3l5.2 4.2" />
      <path d="M4 6.5V13h8V6.5" />
      <path d="M6.6 13v-3.2h2.8V13" />
    </svg>
  )
}

export function ClockIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <circle cx="8" cy="8" r="5.4" />
      <path d="M8 5.2V8l2 1.6" />
    </svg>
  )
}

export function FolderIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M2.4 4.6h4l1.6 1.8H13.6v5.2a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V4.6Z" />
    </svg>
  )
}

/** 任务看板图标（▣ 语义：卡片行/面板）。 */
export function BoardIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <rect x="2.5" y="2.5" width="11" height="3" rx="0.8" />
      <rect x="2.5" y="6.8" width="11" height="3" rx="0.8" />
      <rect x="2.5" y="11.1" width="6.4" height="3" rx="0.8" />
    </svg>
  )
}

/**
 * 智能体图标（V1.2-G · Agent Center）——「能自己干活的主体」语义：
 * 头部轮廓 + 天线 + 双眼，区别于 Folder/Board（物件）与 Chat（会话）。
 */
export function AgentIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M8 1.4v1.9" />
      <circle cx="8" cy="1.3" r="0.6" />
      <rect x="3" y="3.3" width="10" height="7.2" rx="2.2" />
      <path d="M6 6.7h.01" />
      <path d="M10 6.7h.01" />
      <path d="M6.3 11.4v1.5" />
      <path d="M9.7 11.4v1.5" />
    </svg>
  )
}

/**
 * V1.2-E2 · 记忆树入口图标：一个"根 + 两条分支"的层级图形
 * （与记忆树实际形状一致：工作区 → 会话 → 轮次，不是通用"云/脑"臆造符号）。
 */
export function MemoryIcon({ size = 14 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <circle cx="3.2" cy="8" r="1.7" />
      <circle cx="12.8" cy="4" r="1.7" />
      <circle cx="12.8" cy="12" r="1.7" />
      <path d="M4.9 8h3.1V4h3.1" />
      <path d="M8 8v4h3.1" />
    </svg>
  )
}
