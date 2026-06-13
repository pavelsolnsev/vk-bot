import { findTeamSlotLabel } from '../parsers/startCommand.js'
import { ensureRoster, applyTeamLimitsMap, resplitRoster } from './roster.js'
import { isVkTournamentTrListEvent } from '../utils/vkTournamentListEvent.js'

/** Сколько максимум держать id в «хвосте», если сайт ещё не успел включить человека в снимок после join. */
const DEFAULT_SITE_SYNC_GRACE_MS = 45_000

/**
 * Пометить vk_id после успешной записи на сайт — poll не сотрёт человека из текста списка из‑за гонки по времени.
 * Подходит и для реальных id ВК, и для синтетических (отрицательных) после +add / создания с сайта.
 * @param {object} event
 * @param {number} vkUserId
 * @param {number} [ttlMs]
 */
export function noteSiteSyncGraceAfterFootballJoin(event, vkUserId, ttlMs = DEFAULT_SITE_SYNC_GRACE_MS) {
  ensureRoster(event)
  if (typeof vkUserId !== 'number' || !Number.isFinite(vkUserId) || vkUserId === 0) return
  const ms = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_SITE_SYNC_GRACE_MS
  event.siteSyncGraceUntilByVkId.set(vkUserId, Date.now() + ms)
}

/**
 * Перезаписываем состав ВК из порядка на сайте: первые maxPlayers — основа, остальные — очередь.
 * Игроки без vk_user_id на сайте в снимок не попадают (кроме краткого grace после join, см. выше).
 * @param {object} event — объект события из eventStore (participants, queue, maxPlayers, …)
 * @param {number[]} orderedVkUserIds
 * @param {number[]} [paidVkUserIds] — vk_id с отметкой оплаты с сайта (снимок roster-snapshot)
 * @param {Record<string, string>} [teamLabelByVkUserId] — команды с сайта (ключ — vk_id строкой)
 * @param {string[] | null | undefined} [siteTeamSlots] — слоты кнопок с сайта; если передан массив (в т.ч. []), перезаписываем event.teamSlots
 */
export function applySiteRosterToEvent(
  event,
  orderedVkUserIds,
  paidVkUserIds = [],
  teamLabelByVkUserId = {},
  siteTeamSlots = undefined,
  siteTeamLimits = undefined,
) {
  ensureRoster(event)

  const isTr = isVkTournamentTrListEvent(event)
  if (!isTr) {
    // Обычный матч: не тянем команды с сайта — иначе список в ВК превращается в «турнирный».
    event.teamSlots = null
    event.participantTeamByVkId = new Map()
  } else if (Array.isArray(siteTeamSlots)) {
    event.teamSlots = siteTeamSlots.length > 0 ? [...siteTeamSlots] : null
  }

  const slots = Array.isArray(event.teamSlots) && event.teamSlots.length ? event.teamSlots : null
  const prevTeams =
    slots && event.participantTeamByVkId instanceof Map
      ? new Map(event.participantTeamByVkId)
      : null

  const now = Date.now()
  const grace = event.siteSyncGraceUntilByVkId

  const fromSite = []
  const seen = new Set()
  for (const id of orderedVkUserIds) {
    if (typeof id !== 'number' || !Number.isFinite(id) || id === 0) continue
    if (seen.has(id)) continue
    seen.add(id)
    fromSite.push(id)
    grace?.delete(id)
  }

  const tail = []
  if (grace instanceof Map) {
    for (const [vkId, until] of [...grace.entries()]) {
      if (until <= now) {
        grace.delete(vkId)
        continue
      }
      if (seen.has(vkId)) {
        grace.delete(vkId)
        continue
      }
      seen.add(vkId)
      tail.push(vkId)
    }
  }

  // Полный состав с сайта (+ grace-хвост) — множество участников на текущий момент.
  const unique = [...fromSite, ...tail]

  // Новые метки команд по всему составу (нужны и для разбиения, и для определения переходов).
  let nextTeamMap = null
  if (slots) {
    const siteMap =
      teamLabelByVkUserId && typeof teamLabelByVkUserId === 'object' && !Array.isArray(teamLabelByVkUserId)
        ? teamLabelByVkUserId
        : {}
    nextTeamMap = new Map()
    for (const id of unique) {
      const raw = siteMap[id] ?? siteMap[String(id)]
      // Ключ в снимке с сайта: пустая строка = сняли команду, не тянем prev.
      if (raw !== undefined && raw !== null) {
        if (String(raw).trim() === '') {
          continue
        }
        const m = findTeamSlotLabel(slots, String(raw).trim())
        if (m) {
          nextTeamMap.set(id, m)
          continue
        }
      }
      if (prevTeams) {
        const label = prevTeams.get(id)
        if (label) {
          const p = findTeamSlotLabel(slots, label)
          if (p) nextTeamMap.set(id, p)
        }
      }
    }
  }

  // Порядок записи сохраняем (не сбрасываем!): прежних оставляем как были, новых дописываем в конец.
  // Иначе при любом изменении состав/очередь «прыгали» бы по порядку с сайта.
  const siteIdSet = new Set(unique)
  const prevOrder = Array.isArray(event.rosterOrder) ? event.rosterOrder : []
  const kept = prevOrder.filter((id) => siteIdSet.has(id))
  const keptSet = new Set(kept)
  const appended = unique.filter((id) => !keptSet.has(id))
  let nextOrder = [...kept, ...appended]

  // Сменившие команду уходят в КОНЕЦ — то есть в хвост очереди новой команды,
  // не вытесняя тех, кто уже в её основе. Так смена команды на сайте работает как «перешёл в конец».
  if (slots && prevTeams) {
    const changed = nextOrder.filter((id) => {
      const prevRaw = prevTeams.get(id)
      const prevT = prevRaw ? (findTeamSlotLabel(slots, prevRaw) || null) : null
      const newT = (nextTeamMap && nextTeamMap.get(id)) || null
      return prevT !== newT
    })
    if (changed.length) {
      const changedSet = new Set(changed)
      nextOrder = [...nextOrder.filter((id) => !changedSet.has(id)), ...changed]
    }
  }

  if (slots) {
    event.participantTeamByVkId = nextTeamMap
  } else if (isTr && Array.isArray(siteTeamSlots) && siteTeamSlots.length === 0) {
    event.participantTeamByVkId = new Map()
  }

  // Лимиты команд с сайта (только в командном режиме применяются при разбиении).
  if (siteTeamLimits !== undefined) {
    applyTeamLimitsMap(event, siteTeamLimits)
  }

  // Оплата: отмечаем только тех, кто реально в составе.
  const sitePaid = new Set(
    Array.isArray(paidVkUserIds)
      ? paidVkUserIds.filter((id) => typeof id === 'number' && Number.isFinite(id) && id !== 0)
      : [],
  )
  event.paidParticipants = new Set(unique.filter((id) => sitePaid.has(id)))

  // Состав — единый источник, дальше разбиваем по командам (или общему лимиту).
  event.rosterOrder = nextOrder
  resplitRoster(event)
}
