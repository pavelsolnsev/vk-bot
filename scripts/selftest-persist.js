// Проверяем сохранение и восстановление списка: после рестарта бот должен
// поднять тот же список с составом, командами, лимитами и id сообщений.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEventStore } from '../src/store/eventStore.js'
import {
  hydrateStore,
  loadEventStoreFromDisk,
  saveEventStoreToDisk,
  serializeStore,
} from '../src/store/eventStorePersist.js'

function assertEqual(actual, expected, title) {
  if (actual !== expected) {
    throw new Error(`${title}: expected=${String(expected)} actual=${String(actual)}`)
  }
}

function assertDeepEqual(actual, expected, title) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    throw new Error(`${title}: expected=${e} actual=${a}`)
  }
}

/** Список как в бою: турнир с командами, составом, очередью, оплатами и id сообщений. */
function makeStoreWithEvent() {
  const store = createEventStore()
  const event = store.createEvent({
    peerId: 2000000001,
    senderId: 42,
    date: '11.09.2026',
    time: '20:00',
    place: 'tr',
    teamSlots: ['Красные', 'Синие'],
  })
  event.participants = new Set([1, 2])
  event.participantsOrder = [1, 2]
  event.queue = new Set([3])
  event.queueOrder = [3]
  event.rosterOrder = [1, 2, 3]
  event.participantTeamByVkId = new Map([[1, 'Красные'], [2, 'Синие']])
  event.teamLimits = new Map([['красные', 6]])
  event.paidParticipants = new Set([2])
  event.siteSyncGraceUntilByVkId = new Map([[7, 1757600000000]])
  event.listConversationMessageId = 555
  event.listMessageId = 777
  event.listPinned = true
  event.lastSiteRosterSig = '1,2,3|2||'
  return { store, event }
}

function runRoundTripTests() {
  const { store, event } = makeStoreWithEvent()
  const snapshot = JSON.parse(JSON.stringify(serializeStore(store)))

  const restored = createEventStore()
  const count = hydrateStore(restored, snapshot)
  assertEqual(count, 1, 'восстановился один список')

  const next = restored.getEvent(event.id)
  assertEqual(Boolean(next), true, 'список найден по тому же id')
  assertEqual(restored.getLastEventId(event.peerId), event.id, 'последний список беседы восстановлен')

  assertDeepEqual([...next.participants], [1, 2], 'основа восстановлена')
  assertDeepEqual([...next.queue], [3], 'очередь восстановлена')
  assertDeepEqual(next.rosterOrder, [1, 2, 3], 'порядок записи восстановлен')
  assertDeepEqual([...next.participantTeamByVkId.entries()], [[1, 'Красные'], [2, 'Синие']], 'команды игроков восстановлены')
  assertDeepEqual([...next.teamLimits.entries()], [['красные', 6]], 'лимиты команд восстановлены')
  assertDeepEqual([...next.paidParticipants], [2], 'отметки оплаты восстановлены')
  assertDeepEqual([...next.siteSyncGraceUntilByVkId.entries()], [[7, 1757600000000]], 'grace-хвост восстановлен')
  assertDeepEqual(next.teamSlots, ['Красные', 'Синие'], 'кнопки команд восстановлены')

  // Без id сообщения бот не сможет редактировать тот же список в чате.
  assertEqual(next.listConversationMessageId, 555, 'conversation_message_id восстановлен')
  assertEqual(next.listMessageId, 777, 'message_id восстановлен')
  assertEqual(next.listPinned, true, 'флаг закрепа восстановлен')
  assertEqual(next.lastSiteRosterSig, '1,2,3|2||', 'подпись снимка сайта восстановлена')

  // Типы важны: дальше код зовёт .add/.has/.get на этих полях.
  assertEqual(next.participants instanceof Set, true, 'participants снова Set')
  assertEqual(next.teamLimits instanceof Map, true, 'teamLimits снова Map')
}

function runSkipTests() {
  const { store } = makeStoreWithEvent()
  const snapshot = JSON.parse(JSON.stringify(serializeStore(store)))

  // Прошлогодний список поднимать не надо — в чате его давно нет.
  snapshot.events[0].createdAt = Date.now() - 30 * 24 * 60 * 60 * 1000
  const stale = createEventStore()
  assertEqual(hydrateStore(stale, snapshot), 0, 'старый список не восстанавливается')
  assertEqual(stale.lastEventByPeer.size, 0, 'привязка к беседе для старого списка не восстанавливается')

  // Формат другой версии игнорируем целиком, чтобы не поднять несовместимое состояние.
  const otherVersion = createEventStore()
  assertEqual(hydrateStore(otherVersion, { ...snapshot, version: 999 }), 0, 'чужая версия формата игнорируется')

  assertEqual(hydrateStore(createEventStore(), null), 0, 'пустые данные не ломают старт')
}

function runDiskTests() {
  const dir = mkdtempSync(join(tmpdir(), 'vk-bot-state-'))
  const file = join(dir, 'events.json')
  try {
    assertEqual(loadEventStoreFromDisk(createEventStore(), file), 0, 'нет файла — стартуем с пустым списком')

    const { store, event } = makeStoreWithEvent()
    assertEqual(saveEventStoreToDisk(store, { filePath: file, force: true }), true, 'состояние записано на диск')

    const restored = createEventStore()
    assertEqual(loadEventStoreFromDisk(restored, file), 1, 'состояние прочитано с диска')
    assertEqual(restored.getEvent(event.id).listConversationMessageId, 555, 'после чтения с диска список тот же')

    writeFileSync(file, '{ это не json', 'utf8')
    assertEqual(loadEventStoreFromDisk(createEventStore(), file), 0, 'битый файл не роняет бота')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function main() {
  runRoundTripTests()
  runSkipTests()
  runDiskTests()
  console.log('OK: persist selftest passed')
}

main()
