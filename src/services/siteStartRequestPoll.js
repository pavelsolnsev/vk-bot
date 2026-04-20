import { logError, logWarn } from '../utils/botLog.js'
import {
  fetchFootballSiteRosterSnapshot,
  ackVkStartRequest,
  registerVkListLinkOnFootballSite,
} from './footballApi.js'
import { refreshList } from '../handlers/commands/context.js'
import {
  parsePresetStartCommand,
  parseStartCommand,
  parseTestStartCommand,
} from '../parsers/startCommand.js'

const DEFAULT_INTERVAL_MS = 10_000

/** @type {ReturnType<typeof setInterval> | null} */
let timerId = null
let tickInFlight = false

function resolveStartCommand(commandText) {
  const text = String(commandText || '').trim()
  if (!text) return null
  return (
    parseTestStartCommand(text)
    ?? parsePresetStartCommand(text)
    ?? parseStartCommand(text)
  )
}

/**
 * Поллинг «запросов на старт» с сайта.
 * Нужен, чтобы админ мог создать список в ВК из веб-админки без ручной команды в чате.
 */
export function startSiteStartRequestPoll(vk, store, intervalMs = DEFAULT_INTERVAL_MS) {
  if (timerId != null) return

  const run = () => {
    if (tickInFlight) return
    tickInFlight = true
    runTick(vk, store)
      .catch((err) => logError('siteStartRequestPoll/tick', err))
      .finally(() => {
        tickInFlight = false
      })
  }

  run()
  timerId = setInterval(run, intervalMs)
}

async function runTick(vk, store) {
  const snap = await fetchFootballSiteRosterSnapshot()
  if (!snap) return

  const req = snap.startVkRequested
  if (!req || typeof req.commandText !== 'string' || !req.commandText.trim()) return

  const peerFromReq = Number(req.peerId)
  const peerId =
    Number.isFinite(peerFromReq) && peerFromReq !== 0
      ? Math.trunc(peerFromReq)
      : snap.linked === true && typeof snap.peerId === 'number'
        ? snap.peerId
        : null

  if (peerId == null || !Number.isFinite(peerId) || peerId === 0) {
    logWarn(
      'siteStartRequestPoll/noPeer',
      'Сайт запросил старт списка в ВК, но нет peer_id (ни в запросе, ни в привязке).',
    )
    await ackVkStartRequest().catch((err) => logError('siteStartRequestPoll/ackNoPeer', err))
    return
  }

  const startCmd = resolveStartCommand(req.commandText)
  if (!startCmd) {
    logWarn('siteStartRequestPoll/badCommand', 'Сайт запросил старт, но команда не распознана', {
      commandText: req.commandText,
    })
    await ackVkStartRequest().catch((err) => logError('siteStartRequestPoll/ackBadCommand', err))
    return
  }

  const lastId = store.getLastEventId(peerId)
  if (lastId && store.getEvent(lastId)) {
    logWarn('siteStartRequestPoll/alreadyStarted', 'В этой беседе уже открыт список — закройте его (e! в ВК) и повторите.', {
      peerId,
    })
    await ackVkStartRequest().catch((err) => logError('siteStartRequestPoll/ackAlreadyStarted', err))
    return
  }

  // Создаём новое событие в памяти бота и публикуем список в чат.
  // createdBy: 0 — это «системный» старт из сайта.
  const event = store.createEvent({
    peerId,
    senderId: 0,
    date: startCmd.date,
    time: startCmd.time,
    place: startCmd.place,
    teams: startCmd.teams,
  })

  try {
    await refreshList({ vk, store, context: { peerId }, event })
    await registerVkListLinkOnFootballSite({ peerId, gameEventId: event.id })
  } catch (err) {
    logError('siteStartRequestPoll/start', err, { peerId })
    // Даже если публикация не удалась — сбрасываем запрос, чтобы не зациклиться.
    await ackVkStartRequest().catch((e) => logError('siteStartRequestPoll/ackAfterError', e))
    return
  }

  await ackVkStartRequest().catch((err) => logError('siteStartRequestPoll/ackOk', err))
}

