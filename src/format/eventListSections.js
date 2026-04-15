export function formatDateHeading(dateDdMmYyyy, timeHhMm) {
  const [dd, mm, yyyy] = dateDdMmYyyy.split('.').map(Number)
  const [hh, min] = timeHhMm.split(':').map(Number)
  const d = new Date(yyyy, mm - 1, dd, hh, min)
  if (Number.isNaN(d.getTime())) {
    return `🕒 ${dateDdMmYyyy} ${timeHhMm}\n\n`
  }

  const formatted = d.toLocaleString('ru-RU', {
    weekday: 'long',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const parts = formatted.split(', ')
  if (parts.length >= 3) {
    const [weekday, datePart, timePart] = parts
    const wd = weekday.charAt(0).toUpperCase() + weekday.slice(1)
    return `🕒 ${wd}, ${datePart.replace(' г.', '')}, ${timePart}\n\n`
  }

  return `🕒 ${formatted}\n\n`
}

export function formatLocationBlock(loc) {
  const lines = [`📍 МЕСТО ИГРЫ`, `▸ ${loc.address}`]
  if (loc.link) lines.push(`▸ Карта: ${loc.link}`)
  if (loc.route) lines.push(`▸ Маршрут: ${loc.route}`)
  return lines.join('\n') + '\n\n'
}

export function formatTournamentTitle() {
  return '⚡  ТУРНИР РФОИ  ⚡\n\n'
}

export function formatExtraBlock(loc) {
  if (!Array.isArray(loc.extraInfo) || !loc.extraInfo.length) return ''
  const lines = ['📋  УСЛОВИЯ ТУРНИРА']
  loc.extraInfo.forEach((line) => lines.push(`▸ ${line}`))
  return lines.join('\n') + '\n\n'
}

export function formatPaymentBlock(loc) {
  if (typeof loc?.sum !== 'number') return ''
  return (
    `💸 ОПЛАТА\n` +
    `▸ ${loc.sum} ₽\n` +
    `▸ Сбербанк (Павел С.): 89166986185\n` +
    `▸ Наличные — на месте\n` +
    `❗ В комментарии укажи свой ник из списка\n\n`
  )
}

export function formatInstructionsBlock() {
  // Подписи как на сайте: игроки, команды, табло, информация — чтобы люди не путали ссылки.
  return (
    `🌐Игроки: https://football.pavelsolntsev.ru\n` +
    `🏆Команды: https://football.pavelsolntsev.ru/tournament/\n` +
    `📺Итоги игр и live: https://tournament.pavelsolntsev.ru/\n` +
    `ℹ️Информация: https://football.pavelsolntsev.ru/info\n` +
    `📣ВКонтакте: https://vk.com/rmsfootball\n\n` +
    `🕹 КАК ЗАПИСАТЬСЯ\n` +
    `▸ Нажми кнопку Играть или напиши в чат +\n` +
    `▸ Нажми кнопку Выйти или напиши в чат -\n\n`
  )
}

export function formatSummaryBlock(count, limit) {
  let block
  if (typeof limit === 'number') {
    block = `\n📊 Игроков: ${count} из ${limit}\n`
  } else {
    block = `\n📊 Игроков: ${count}\n`
  }
  return block
}
