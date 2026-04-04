let nextVirtualId = -1

export function createVirtualPlayerId() {
  return nextVirtualId--
}

export function setVirtualPlayerName(userNameCache, id, name) {
  if (typeof id !== 'number') return
  if (typeof name !== 'string' || name.trim() === '') return
  userNameCache.set(id, name.trim())
}

