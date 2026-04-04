import { formatPlayerName } from "./playerName.js";

// Локации и их блоки, по аналогии с telegram-bot/utils/sendPlayerList.js
const locations = {
  kz: {
    name: "Красное Знамя",
    address:
      "Московская область, г. Раменское, ул. Воровского, д.4A (Красное Знамя - Спортивный зал)",
    link: "https://yandex.ru/maps/-/CLuPMJ3L",
    route:
      "https://yandex.ru/maps/?mode=routes&rtext=~55.574202,38.205299&rtt=auto",
    sum: 400,
    limit: 20,
    blocks: [
      "date",
      "location",
      "payment",
      "instructions",
      "players",
      "queue",
      "summary",
    ],
  },

  prof: {
    name: "Профилакторий",
    address:
      "Московская область, г. Раменское, ул. Махова, д.18. (Профилакторий)",
    link: "https://yandex.ru/maps/-/CHfBZ-mH",
    route:
      "https://yandex.ru/maps/?mode=routes&rtext=~55.578414,38.219605&rtt=auto",
    sum: 400,
    limit: 20,
    blocks: [
      "date",
      "location",
      "payment",
      "instructions",
      "players",
      "queue",
      "summary",
    ],
  },

  saturn: {
    name: "Сатурн",
    address:
      "Московская область, г. Раменское, ул. Народное Имение, 6А (Стадион Сатурн - спорт зал)",
    link: "https://yandex.ru/maps/-/CLBZ4H~9",
    route:
      "https://yandex.ru/maps/?mode=routes&rtext=~55.578216,38.226238&rtt=auto",
    sum: 600,
    limit: 10,
    blocks: [
      "date",
      "location",
      "payment",
      "instructions",
      "players",
      "queue",
      "summary",
    ],
  },

  tr: {
    name: "Турнир",
    address:
      "Московская область, г. Раменское, ул. Воровского, д.4A (Красное Знамя - Спортивный зал)",
    link: "https://yandex.ru/maps/-/CLuPMJ3L",
    route:
      "https://yandex.ru/maps/?mode=routes&rtext=~55.574202,38.205299&rtt=auto",
    limit: 20,
    extraInfo: [
      "Запись: только для участников турнира.",
      "Формат: в 3 круга каждый с каждым.",
      "Время: 2 часа.",
    ],
    blocks: [
      "date",
      "tournamentTitle",
      "location",
      "extra",
      "instructions",
      "players",
      "queue",
      "summary",
    ],
  },
};

function formatDateHeading(dateDdMmYyyy, timeHhMm) {
  const [dd, mm, yyyy] = dateDdMmYyyy.split(".").map(Number);
  const [hh, min] = timeHhMm.split(":").map(Number);
  const d = new Date(yyyy, mm - 1, dd, hh, min);
  if (Number.isNaN(d.getTime())) {
    return `🕒 ${dateDdMmYyyy} ${timeHhMm}\n\n`;
  }

  const formatted = d.toLocaleString("ru-RU", {
    weekday: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = formatted.split(", ");
  if (parts.length >= 3) {
    const [weekday, datePart, timePart] = parts;
    const wd = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return `🕒 ${wd}, ${datePart.replace(" г.", "")}, ${timePart}\n\n`;
  }

  return `🕒 ${formatted}\n\n`;
}

function formatLocationBlock(loc) {
  const lines = [`📍 МЕСТО ИГРЫ`, `▸ ${loc.address}`];
  return lines.join("\n") + "\n\n";
}

function formatTournamentTitle() {
  return "⚡  ТУРНИР РФОИ  ⚡\n";
}

function formatExtraBlock(loc) {
  if (!Array.isArray(loc.extraInfo) || !loc.extraInfo.length) return "";
  const lines = ["📋  УСЛОВИЯ ТУРНИРА"];
  loc.extraInfo.forEach((line) => lines.push(`▸ ${line}`));
  return lines.join("\n") + "\n\n";
}

function formatPaymentBlock(loc) {
  if (typeof loc?.sum !== "number") return "";
  return (
    `💸 ОПЛАТА\n` +
    `▸ ${loc.sum} ₽\n` +
    `▸ Сбербанк (Павел С.): 89166986185\n` +
    `▸ Наличные — на месте\n` +
    `❗ В комментарии укажи свой ник из списка\n\n`
  );
}

function formatInstructionsBlock() {
  return (
    `🌐Рейтинг: https://football.pavelsolntsev.ru\n` +
    `🏆Турнир:  https://football.pavelsolntsev.ru/tournament/\n` +
    `ℹ️Инфо:    https://football.pavelsolntsev.ru/info\n` +
    `📣ВКонтакте: https://vk.com/rmsfootball\n\n` +
    `🕹 КАК ЗАПИСАТЬСЯ\n` +
    `▸ Нажми кнопку Играть\n` +
    `▸ Нажми кнопку Выйти\n\n`
  );
}

function formatPlayerLine(index, name, isPaid) {
  const paddedIndex = `${index + 1}`.padStart(2, " ") + ".";
  const paddedName = formatPlayerName(name, 14).padEnd(14, " ");
  return `${paddedIndex} ${paddedName}${isPaid ? " ✅" : ""}`;
}

function formatPlayersBlock(names, paid, limit) {
  const header = [`🏆 В игре:`];
  let playerLines;
  if (!names.length) {
    playerLines = [`   — пока никто не записался`];
  } else {
    playerLines = names.map(
      (n, i) => `   ${formatPlayerLine(i, n, paid?.[i] === true)}`,
    );
  }

  return [...header, ...playerLines].join("\n") + "\n";
}

function formatQueueBlock(queueNames) {
  if (!queueNames?.length) return "";
  const header = [`📢 Очередь:`];
  const lines = queueNames.map((n, i) => {
    const paddedIndex = `${i + 1}`.padStart(2, " ") + ".";
    const paddedName = formatPlayerName(n, 14).padEnd(14, " ");
    return `   ${paddedIndex} ${paddedName}`;
  });
  // ведущий перенос, чтобы отделить от блока "В игре"
  return "\n" + [...header, ...lines].join("\n") + "\n";
}

function formatSummaryBlock(count, limit) {
  if (typeof limit === "number") {
    return `\n📊 Игроков: ${count} из ${limit}\n`;
  }
  return `\n📊 Игроков: ${count}\n`;
}

/**
 * place — код локации (kz/prof/tr/saturn) или произвольный текст.
 */
export function buildEventListText({
  date,
  time,
  place,
  names,
  paid,
  queueNames,
  maxPlayers,
}) {
  const placeKey = String(place || "")
    .trim()
    .toLowerCase();
  const loc = locations[placeKey] || null;

  const blocks = loc
    ? loc.blocks
    : ["date", "location_fallback", "instructions", "players", "summary"];

  let text = "";

  for (const block of blocks) {
    if (block === "date") {
      text += formatDateHeading(date, time);
    } else if (block === "location") {
      text += formatLocationBlock(loc);
    } else if (block === "location_fallback") {
      text += `📍  МЕСТО ИГРЫ${place}\n\n`;
    } else if (block === "tournamentTitle") {
      text += formatTournamentTitle();
    } else if (block === "extra") {
      text += formatExtraBlock(loc);
    } else if (block === "payment") {
      text += formatPaymentBlock(loc);
    } else if (block === "instructions") {
      text += formatInstructionsBlock();
    } else if (block === "players") {
      text += formatPlayersBlock(names, paid, maxPlayers ?? loc?.limit);
    } else if (block === "queue") {
      text += formatQueueBlock(queueNames);
    } else if (block === "summary") {
      text += formatSummaryBlock(names.length, maxPlayers ?? loc?.limit);
    }
  }

  return text;
}
