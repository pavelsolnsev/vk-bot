export function getUserIdByIndex(event, index1based) {
  const index = Number(index1based)
  if (!Number.isFinite(index) || index <= 0) return null
  const ids = Array.isArray(event.participantsOrder)
    ? event.participantsOrder
    : [...(event.participants || [])]
  return ids[index - 1] ?? null
}

