import { eventListLocations } from './eventListLocations.js'

/** Сумма участия, заданная при создании матча (с сайта). Нет или некорректна — null. */
export function explicitEventSum(event) {
  const n = Number(event?.sum)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/**
 * Сколько стоит участие в этом матче: сумма, которую админ ввёл при создании на сайте,
 * а если её нет (старые списки, команда s … из чата) — сумма по умолчанию для локации.
 */
export function resolveEventSum(event) {
  const explicit = explicitEventSum(event)
  if (explicit != null) return explicit
  const key = String(event?.place ?? '').trim().toLowerCase()
  const fromLocation = eventListLocations[key]?.sum
  return typeof fromLocation === 'number' ? fromLocation : null
}
