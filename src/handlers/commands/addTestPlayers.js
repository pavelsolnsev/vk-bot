import { joinEvent } from '../../services/roster.js'
import { createVirtualPlayerId, setVirtualPlayerName } from '../../services/virtualPlayers.js'
import { refreshList } from './context.js'

export async function tryAddTestPlayers({ vk, store, context, event, text }) {
  if (!/^\+1test$/iu.test(text)) return false

  const base = (event.participantsOrder?.length || event.participants?.size || 0) + (event.queueOrder?.length || event.queue?.size || 0)

  // Набор тестовых игроков по мотивам telegram-bot/commands/add (+1test):
  // разные длины, пробелы, эмодзи, спецсимволы, кириллица/латиница, регистр и т.д.
  const names = [
    `TestNameOnly${base + 1}`,
    `testuseronly${base + 2}`, // "только username" аналог — у нас это просто имя
    `Player${base + 3}`, // дефолт
    `Undefined${base + 4}`, // условный undefined-кейс
    `ОченьДлинноеИмяИгрокаДляТестированияМаксимальнойДлиныИПроверкиФорматирования${base + 5}`,
    `A${base + 6}`,
    `Test😀Player${base + 7}`,
    `😀🎮⚽${base + 8}`,
    `Test Player With Spaces ${base + 9}`,
    `          ${base + 10}`, // только пробелы (будет трим)
    `Player123${base + 11}`,
    ``, // пустая строка (пропустится)
    `ОченьДлинноеИмяИгрока${base + 12}`,
    `XY${base + 13}`,
    `verylongusernamethatexceedsnormallimitsandtestsformatting${base + 14}`,
    `ИгрокТест${base + 15}`,
    `ТестовыйИгрок${base + 16}`,
    `TEST PLAYER ${base + 17}`,
    `test player ${base + 18}`,
    `TeSt PlAyEr ${base + 19}`,
    `Test-Player.Name ${base + 20}`,
    `Очень Длинное Имя Игрока С Множеством Пробелов Для Тестирования ${base + 21}`,
    `Я${base + 22}`,
    `PlayerWithZeroStats${base + 23}`,
    `Player!@#$% ${base + 24}`,
    `Test\tPlayer ${base + 25}`,
    `Fjfjd😎😎😊 𝕹𝖎𝖐𝖎𝖙𝖆 𝕬𝖑𝖊𝖐𝖘𝖆𝖓𝖉𝖗𝖔𝖛𝖎𝖈𝖍 ${base + 26}`,
    `𝕹𝖎𝖐𝖎𝖙𝖆 𝕬𝖑𝖊𝖐𝖘𝖆𝖓𝖉𝖗𝖔𝖛𝖎𝖈𝖍 ${base + 27}`,
    `hcndbdncj ${base + 28}`,
    `Смешанные Символы 😎 TEST ${base + 29}`,
  ]

  for (const n of names) {
    const trimmed = String(n ?? '').trim()
    if (!trimmed) continue
    const id = createVirtualPlayerId()
    setVirtualPlayerName(store.userNameCache, id, trimmed)
    joinEvent(event, id)
  }

  await refreshList({ vk, store, context, event })
  return true
}

