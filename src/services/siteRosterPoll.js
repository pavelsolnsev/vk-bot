import { logError, logWarn } from '../utils/botLog.js'
import { fetchFootballSiteRosterSnapshot, ackVkListCloseRequest, unregisterVkListLinkOnFootballSite } from './footballApi.js'
import { applySiteRosterToEvent } from './applySiteRosterToEvent.js'
import { refreshListForEvent } from '../handlers/commands/context.js'
import { runCloseEvent } from '../handlers/commands/closeEvent.js'
import { deleteLiveNoticeMessage, sendTournamentLiveNotice } from '../vk/tournamentLiveNotice.js'

const DEFAULT_INTERVAL_MS = 22_000
const POLL_DEBUG = 'siteRosterPoll/debug'

function isSiteRosterPollLogEnabled() {
  const v = (process.env.SITE_ROSTER_POLL_LOG || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function pollDebug(message, meta) {
  if (!isSiteRosterPollLogEnabled()) return
  const prefix = `[vk-bot:${POLL_DEBUG}]`
  if (meta != null && typeof meta === 'object' && Object.keys(meta).length > 0) {
    console.log(prefix, message, meta)
  } else {
    console.log(prefix, message)
  }
}

/** @type {ReturnType<typeof setInterval> | null} */
let pollTimerId = null

/** Одна «сессия» поллинга: не запускаем второй тик, пока предыдущий не закончился. */
let pollTickInFlight = false

function getPollIntervalMs() {
  const n = Number(process.env.SITE_ROSTER_POLL_MS || DEFAULT_INTERVAL_MS)
  return Number.isFinite(n) && n >= 5000 ? n : DEFAULT_INTERVAL_MS
}

/**
 * Поллинг сайта только пока открыт список в ВК: синхронизация состава (кто в списке) и закрытие по флагу с сайта.
 * Таймер не крутится между списками — старт после link-event, стоп при закрытии или потере связи события.
 * @param {import('vk-io').VK} vk
 * @param {ReturnType<import('../store/eventStore.js').createEventStore>} store
 * @param {number} [intervalMs]
 */
export function startSiteRosterPoll(vk, store, intervalMs = getPollIntervalMs()) {
  if (pollTimerId != null) {
    pollDebug('start пропущен — поллинг уже запущен')
    return
  }

  const run = () => {
    if (pollTickInFlight) {
      pollDebug('тик пропущен — предыдущий ещё выполняется')
      return
    }
    pollTickInFlight = true
    runSiteRosterPollTick(vk, store)
      .catch((err) => logError('siteRosterPoll/tick', err))
      .finally(() => {
        pollTickInFlight = false
      })
  }

  pollDebug('поллинг запущен', { intervalMs })
  run()
  pollTimerId = setInterval(run, intervalMs)
}

/** Остановить поллинг (после закрытия списка или сигнала с сайта). */
export function stopSiteRosterPoll() {
  const had = pollTimerId != null
  if (pollTimerId != null) {
    clearInterval(pollTimerId)
    pollTimerId = null
  }
  pollDebug('поллинг остановлен', { hadActiveTimer: had })
}

/**
 * @param {import('vk-io').VK} vk
 * @param {ReturnType<import('../store/eventStore.js').createEventStore>} store
 */
export async function runSiteRosterPollTick(vk, store) {
  const t0 = Date.now()
  pollDebug('тик: запрос snapshot…')

  const snap = await fetchFootballSiteRosterSnapshot()
  if (!snap) {
    pollDebug('тик: нет ответа (сайт выключен в боте, сеть или 403)', { ms: Date.now() - t0 })
    return
  }

  pollDebug('тик: snapshot', {
    ms: Date.now() - t0,
    linked: snap.linked === true,
    closeRequested: snap.closeVkListRequested === true,
    peerId: typeof snap.peerId === 'number' ? snap.peerId : null,
    gameEventId: typeof snap.gameEventId === 'string' ? snap.gameEventId : null,
    rosterLen: Array.isArray(snap.rosterVkUserIds) ? snap.rosterVkUserIds.length : 0,
    matchStatus: typeof snap.matchStatus === 'string' ? snap.matchStatus : null,
  })

  if (snap.closeVkListRequested === true) {
    if (snap.linked === true && typeof snap.peerId === 'number') {
      const closed = await runCloseEvent({ vk, store, peerId: snap.peerId })
      pollDebug('сайт запросил закрытие списка', { closed, peerId: snap.peerId })
      if (!closed) {
        await unregisterVkListLinkOnFootballSite().catch((err) =>
          logError('siteRosterPoll/unregister', err),
        )
      }
    } else {
      pollDebug('сайт запросил закрытие, linked=false — unlink')
      await unregisterVkListLinkOnFootballSite().catch((err) =>
        logError('siteRosterPoll/unregisterNoLink', err),
      )
    }
    await ackVkListCloseRequest().catch((err) => logError('siteRosterPoll/ackClose', err))
    stopSiteRosterPoll()
    return
  }

  if (snap.linked !== true) {
    pollDebug('тик: linked=false — нечего синкать', { ms: Date.now() - t0 })
    return
  }

  const { peerId, gameEventId, rosterVkUserIds } = snap
  if (typeof peerId !== 'number' || typeof gameEventId !== 'string') {
    pollDebug('тик: пропуск — битые peerId/gameEventId', { peerId, gameEventId })
    return
  }

  const roster = Array.isArray(rosterVkUserIds) ? rosterVkUserIds : []
  const ev = store.getEvent(gameEventId)
  if (!ev || ev.peerId !== peerId) {
    logWarn(
      'siteRosterPoll/noEvent',
      'Сайт привязан к беседе, но списка нет в памяти бота или peerId не совпадает — синк пропущен, поллинг остановлен (запустите список заново или снимите привязку на сайте)',
      { gameEventId, peerId, hasEvent: Boolean(ev) },
    )
    pollDebug('тик: остановка — нет события в памяти', { gameEventId, peerId, hasEvent: Boolean(ev) })
    stopSiteRosterPoll()
    return
  }

  const matchStatus =
    snap.matchStatus === 'live' || snap.matchStatus === 'finished' || snap.matchStatus === 'upcoming'
      ? snap.matchStatus
      : 'upcoming'
  const liveHomeTeam = typeof snap.liveHomeTeam === 'string' ? snap.liveHomeTeam : ''
  const liveAwayTeam = typeof snap.liveAwayTeam === 'string' ? snap.liveAwayTeam : ''

  if (!ev._siteMatchPollBootstrapped) {
    ev._siteMatchPollBootstrapped = true
    ev.lastSiteMatchStatus = matchStatus
    pollDebug('тик: первый снимок matchStatus — уведомление live не шлём (старт поллинга)', { matchStatus })
  } else if (ev.lastSiteMatchStatus !== 'live' && matchStatus === 'live') {
    try {
      await sendTournamentLiveNotice(vk, peerId, ev, { homeTeam: liveHomeTeam, awayTeam: liveAwayTeam })
      pollDebug('тик: отправлено уведомление «Игра началась»', { peerId })
    } catch (err) {
      logError('siteRosterPoll/liveNotice', err, { peerId, gameEventId })
    }
    ev.lastSiteMatchStatus = matchStatus
  } else if (ev.lastSiteMatchStatus !== matchStatus) {
    if (ev.lastSiteMatchStatus === 'live' && matchStatus !== 'live') {
      try {
        await deleteLiveNoticeMessage(vk, { peerId, event: ev })
        pollDebug('тик: уведомление «Игра началась» удалено (матч не live)', { peerId })
      } catch (err) {
        logError('siteRosterPoll/deleteLiveNotice', err, { peerId, gameEventId })
      }
    }
    ev.lastSiteMatchStatus = matchStatus
    pollDebug('тик: matchStatus обновлён', { matchStatus })
  }

  const sig = roster.join(',')
  if (ev.lastSiteRosterSig === sig) {
    pollDebug('тик: состав без изменений — список в ВК не трогаем', { ms: Date.now() - t0 })
    return
  }

  ev.lastSiteRosterSig = sig
  applySiteRosterToEvent(ev, roster)
  await refreshListForEvent({ vk, store, event: ev })
  pollDebug('тик: состав применён, список в ВК обновлён', {
    ms: Date.now() - t0,
    rosterCount: roster.length,
  })
}
