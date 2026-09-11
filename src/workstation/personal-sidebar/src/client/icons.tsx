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
