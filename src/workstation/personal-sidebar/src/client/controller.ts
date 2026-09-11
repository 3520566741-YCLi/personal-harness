// dsh-personal-sidebar — mode controller (pure, React-free).
// Owns whether the Personal browsing region is mounted:
//   personal -> the plugin shadows `sidebar.workspaces`
//   official -> the occupant is disposed and the built-in ui-workspace
//               browser (always registered) takes over.
//
// V1.1 P1 E2 Runtime Fix (v0.1.10): the Personal Harness UI must be directly
// visible (or reachable through an unmistakable entry) for a normal user.
// Default mode is now PERSONAL until the user explicitly picks a side; their
// explicit choice is honoured afterwards via a userSet flag. Official stays
// reachable in one click at all times (never lock the user in Personal).
import { useSyncExternalStore } from 'react'

export type PersonalMode = 'personal' | 'official'

const KEY = 'dsh.personalSidebar.mode'
const KEY_SET = 'dsh.personalSidebar.userSet'
const DEFAULT_MODE: PersonalMode = 'personal'

function readMode(): PersonalMode {
  try {
    const chosen = window.localStorage.getItem(KEY_SET) === '1'
    if (chosen) return window.localStorage.getItem(KEY) === 'personal' ? 'personal' : 'official'
    return DEFAULT_MODE
  } catch {
    return DEFAULT_MODE
  }
}

let mode: PersonalMode = readMode()
const subs = new Set<() => void>()

export const personalMode = {
  get(): PersonalMode {
    return mode
  },
  set(next: PersonalMode): void {
    if (mode === next) return
    mode = next
    try {
      window.localStorage.setItem(KEY_SET, '1') // explicit user choice from now on
      window.localStorage.setItem(KEY, mode)
    } catch {
      // ignore storage failure; in-memory still applies for this page
    }
    subs.forEach((f) => f())
  },
  subscribe(f: () => void): () => void {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
}

/** React hook: current mode with live updates. */
export function usePersonalMode(): PersonalMode {
  return useSyncExternalStore(
    (f) => personalMode.subscribe(f),
    () => personalMode.get(),
    () => 'personal',
  )
}
