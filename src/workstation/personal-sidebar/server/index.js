// dsh-personal-sidebar — host (server) half.
// STAGE 1 is UI-only: the client bundle registers the Personal sidebar.
// This Node half exists so the Cordis bundle patch has a mount row; it
// intentionally owns no services and performs no network/filesystem work.
export const name = 'dsh-personal-sidebar'

export function apply() {
  // intentionally empty — all behaviour lives in the client bundle (client.js)
}

export default { name, apply }
