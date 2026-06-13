import { findTeamSlotLabel } from '../parsers/startCommand.js'

/** Дефолтный лимит команды, пока он не задан явно (на сайте или командой tl). Менять при необходимости. */
export const DEFAULT_TEAM_LIMIT = 8

/**
 * Логика списка + очереди:
 * - без команд: один общий лимит (maxPlayers), одна очередь;
 * - с командами (teamSlots): у каждой команды свой лимит и своя очередь, «Без команды» — без лимита.
 *
 * Единый источник состава — event.rosterOrder (порядок записи). participants/queue и их order —
 * производные: их пересчитывает resplitRoster() из rosterOrder после любого изменения.
 */
export function ensureRoster(event) {
  if (!event.queue) event.queue = new Set()
  if (!event.queueOrder) event.queueOrder = []
  if (!event.paidParticipants) event.paidParticipants = new Set()
  if (!Number.isFinite(event.maxPlayers) || event.maxPlayers <= 0) event.maxPlayers = 20
  if (!event.participants) event.participants = new Set()
  if (!event.participantsOrder) event.participantsOrder = []
  // Карта «кто в какой команде» только для отображения в ВК; без неё старые события ведут себя как раньше.
  if (!event.participantTeamByVkId) event.participantTeamByVkId = new Map()
  // Временная «страховка» после POST /api/vk/join: снимок состава мог прийти из БД на мгновение раньше фиксации.
  if (!event.siteSyncGraceUntilByVkId) event.siteSyncGraceUntilByVkId = new Map()
  // Лимиты по командам (ключ — нормализованное имя в нижнем регистре).
  if (!(event.teamLimits instanceof Map)) event.teamLimits = new Map()
  // Порядок записи всех участников (основа + очередь) — единый источник для пересчёта.
  if (!Array.isArray(event.rosterOrder)) {
    event.rosterOrder = [
      ...(Array.isArray(event.participantsOrder) ? event.participantsOrder : []),
      ...(Array.isArray(event.queueOrder) ? event.queueOrder : []),
    ]
  }
}

/** Нормализованный ключ команды: один пробел, без краёв, нижний регистр (совпадает с сайтом). */
export function normTeamKey(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Есть ли в событии команды (турнирный режим). */
function teamModeActive(event) {
  return Array.isArray(event.teamSlots) && event.teamSlots.length > 0
}

/** Лимит конкретной команды: явный из teamLimits, иначе дефолт. */
export function teamLimitFor(event, slot) {
  const key = normTeamKey(slot)
  const v = event.teamLimits instanceof Map ? event.teamLimits.get(key) : undefined
  if (Number.isFinite(v) && v > 0) return Math.floor(v)
  return DEFAULT_TEAM_LIMIT
}

/**
 * Разбивает rosterOrder на основу и очередь.
 * Без команд — по общему maxPlayers. С командами — по лимиту каждой команды,
 * «Без команды» целиком в основу (без лимита). Порядок основы: команды по порядку slots, затем «без команды».
 * @returns {{ mainOrder: number[], queueOrder: number[] }}
 */
export function splitRosterByTeams(event) {
  const order = Array.isArray(event.rosterOrder) ? event.rosterOrder : []

  if (!teamModeActive(event)) {
    const max = event.maxPlayers
    return { mainOrder: order.slice(0, max), queueOrder: order.slice(max) }
  }

  const slots = event.teamSlots
  const teamMap = event.participantTeamByVkId instanceof Map ? event.participantTeamByVkId : new Map()

  // Группируем игроков по каноничному слоту, сохраняя порядок записи; без метки — «Без команды».
  const bySlot = new Map(slots.map((s) => [s, []]))
  const noTeam = []
  for (const id of order) {
    const raw = teamMap.get(id)
    const canon = raw ? findTeamSlotLabel(slots, raw) : null
    if (canon && bySlot.has(canon)) bySlot.get(canon).push(id)
    else noTeam.push(id)
  }

  const mainOrder = []
  const queueOrder = []
  for (const s of slots) {
    const members = bySlot.get(s) ?? []
    const limit = teamLimitFor(event, s)
    mainOrder.push(...members.slice(0, limit))
    queueOrder.push(...members.slice(limit))
  }
  // «Без команды» — всегда в основе, без лимита и без очереди.
  mainOrder.push(...noTeam)

  return { mainOrder, queueOrder }
}

/** Пересчитывает participants/queue (+order) из rosterOrder; чистит paid от выбывших. */
export function resplitRoster(event) {
  ensureRoster(event)
  const { mainOrder, queueOrder } = splitRosterByTeams(event)
  event.participantsOrder = mainOrder
  event.participants = new Set(mainOrder)
  event.queueOrder = queueOrder
  event.queue = new Set(queueOrder)
  if (event.paidParticipants instanceof Set) {
    const all = new Set([...mainOrder, ...queueOrder])
    for (const id of [...event.paidParticipants]) {
      if (!all.has(id)) event.paidParticipants.delete(id)
    }
  }
}

function clearSiteSyncGraceForVkId(event, userId) {
  event.siteSyncGraceUntilByVkId?.delete(userId)
}

/** Если в матче заданы команды, запоминаем выбор с кнопки (или не трогаем карту при записи через +). */
function noteTeamChoiceAfterJoin(event, userId, teamFromButton) {
  const slots = event.teamSlots
  if (!Array.isArray(slots) || !slots.length) return
  ensureRoster(event)
  // Сопоставляем мягко (регистр/пробелы), но сохраняем каноничное имя слота.
  const matched = findTeamSlotLabel(slots, teamFromButton)
  if (!matched) return
  event.participantTeamByVkId.set(userId, matched)
}

export function joinEvent(event, userId, joinOptions = {}) {
  ensureRoster(event)

  const slots = Array.isArray(event.teamSlots) ? event.teamSlots : []
  const wantTeam = slots.length ? findTeamSlotLabel(slots, joinOptions.team) : null
  const alreadyIn = event.participants.has(userId) || event.queue.has(userId)

  if (alreadyIn) {
    // Уже в списке. Нажал кнопку ДРУГОЙ команды → переводим его в неё (основа или её очередь).
    if (wantTeam) {
      const cur = event.participantTeamByVkId.get(userId)
      const curCanon = cur ? findTeamSlotLabel(slots, cur) : null
      if (wantTeam !== curCanon) {
        const prevMain = new Set(event.participants)
        event.participantTeamByVkId.set(userId, wantTeam)
        // В конец порядка → в хвост новой команды (её основу не вытесняем).
        event.rosterOrder = event.rosterOrder.filter((id) => id !== userId)
        event.rosterOrder.push(userId)
        resplitRoster(event)
        const status = event.participants.has(userId) ? 'main' : 'queue'
        // Если игрок освободил место в старой команде — мог подняться кто-то из её очереди.
        const promoted = [...event.participants].filter((id) => id !== userId && !prevMain.has(id))
        return { status, switched: true, team: wantTeam, promoted }
      }
    }
    return { status: 'noop' }
  }

  // Новая запись: в конец порядка записи + фиксируем команду с кнопки, затем пересчитываем разбиение.
  if (!event.rosterOrder.includes(userId)) event.rosterOrder.push(userId)
  noteTeamChoiceAfterJoin(event, userId, joinOptions.team)
  resplitRoster(event)

  if (event.participants.has(userId)) return { status: 'main' }
  if (event.queue.has(userId)) return { status: 'queue' }
  return { status: 'noop' }
}

export function leaveEvent(event, userId) {
  ensureRoster(event)
  clearSiteSyncGraceForVkId(event, userId)

  const wasMain = event.participants.has(userId)
  const wasQueue = event.queue.has(userId)
  if (!wasMain && !wasQueue) return { leftFrom: 'none', promoted: [] }

  // Кто был в основе до выхода — чтобы вычислить, кого подняли из очереди (той же команды).
  const prevMain = new Set(event.participants)
  event.rosterOrder = event.rosterOrder.filter((id) => id !== userId)
  event.paidParticipants?.delete(userId)
  event.participantTeamByVkId?.delete(userId)
  resplitRoster(event)

  const promoted = [...event.participants].filter((id) => !prevMain.has(id))
  return { leftFrom: wasMain ? 'main' : 'queue', promoted }
}

/** Общий лимит — только для не-командных списков (в командном режиме разбиение идёт по teamLimits). */
export function setLimit(event, newLimit) {
  ensureRoster(event)

  const limit = Number(newLimit)
  if (!Number.isFinite(limit) || limit <= 0) return { movedToQueue: [], promoted: [] }
  if (limit === event.maxPlayers) return { movedToQueue: [], promoted: [] }

  const prevMain = new Set(event.participants)
  event.maxPlayers = limit
  resplitRoster(event)

  const movedToQueue = [...event.queue].filter((id) => prevMain.has(id))
  const promoted = [...event.participants].filter((id) => !prevMain.has(id))
  return { movedToQueue, promoted }
}

/**
 * Установить лимит конкретной команды (по каноничному имени или индексу слота).
 * @returns {{ ok: false } | { ok: true, canon: string, limit: number, movedToQueue: number[], promoted: number[] }}
 */
export function setTeamLimit(event, slotRaw, newLimit) {
  ensureRoster(event)
  const slots = Array.isArray(event.teamSlots) ? event.teamSlots : []
  const canon = findTeamSlotLabel(slots, slotRaw)
  if (!canon) return { ok: false }

  const limit = Math.floor(Number(newLimit))
  if (!Number.isFinite(limit) || limit < 1) return { ok: false }

  const prevMain = new Set(event.participants)
  event.teamLimits.set(normTeamKey(canon), limit)
  resplitRoster(event)

  const movedToQueue = [...event.queue].filter((id) => prevMain.has(id))
  const promoted = [...event.participants].filter((id) => !prevMain.has(id))
  return { ok: true, canon, limit, movedToQueue, promoted }
}

/** Применить карту лимитов с сайта (vkTeamLimits) к событию: перезаписывает event.teamLimits. */
export function applyTeamLimitsMap(event, limitsObj) {
  ensureRoster(event)
  const next = new Map()
  if (limitsObj && typeof limitsObj === 'object' && !Array.isArray(limitsObj)) {
    for (const [k, v] of Object.entries(limitsObj)) {
      const key = normTeamKey(k)
      const n = Math.floor(Number(v))
      if (key && Number.isFinite(n) && n >= 1) next.set(key, n)
    }
  }
  event.teamLimits = next
}

export function removeUserEverywhere(event, userId) {
  ensureRoster(event)
  clearSiteSyncGraceForVkId(event, userId)
  event.rosterOrder = (event.rosterOrder ?? []).filter((id) => id !== userId)
  event.paidParticipants?.delete(userId)
  event.participantTeamByVkId?.delete(userId)
  resplitRoster(event)
}
