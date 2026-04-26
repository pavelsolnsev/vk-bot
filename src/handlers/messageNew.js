import { isAdmin } from "../auth/admin.js";
import { deleteIncomingCommandMessage } from "../vk/deleteIncomingCommandMessage.js";
import { sendEphemeral } from "../vk/sendEphemeral.js";
import { runCloseEvent } from "./commands/closeEvent.js";
import { getLastEventOrNull } from "./commands/lastEvent.js";
import { tryStartEvent } from "./commands/startEvent.js";
import { trySetLimit } from "./commands/limit.js";
import { tryPayByNumber, tryUnpayByNumber } from "./commands/payByNumber.js";
import { tryRemoveByNumber } from "./commands/removeByNumber.js";
import { tryPlusMinus } from "./commands/plusMinus.js";
import { tryAddByName } from "./commands/addByName.js";
import { tryAddTestPlayers } from "./commands/addTestPlayers.js";
import { tryAddTeamSlots } from "./commands/addTeamSlot.js";
import { tryRemoveTeamSlot } from "./commands/removeTeamSlot.js";
import { tryMovePlayerTeam } from "./commands/movePlayerTeam.js";
import { runRdy } from "./commands/rdy.js";
import { logError } from "../utils/botLog.js";

export function createMessageNewHandler({ vk, store }) {
  return async (context) => {
    try {
      // Не реагируем на сообщения от самого сообщества (senderId отрицательный = group).
      // isOutbox ненадёжен для long poll группы — проверяем senderId.
      if (context.senderId < 0) return;

      const textRaw = (context.text || "").trim();
      const peerId = context.peerId;
      const senderId = context.senderId;

      if (!textRaw) return;

      // Разрешаем формат вида "@rmsfootball +" (когда пишут в чате с упоминанием сообщества)
      const text = textRaw.replace(/^@\S+\s+/u, "").trim();

      const admin = isAdmin(senderId);

      // Команды, которые могут выполнять все (но сообщение с командой удаляем всегда)
      const lastEvent = getLastEventOrNull({ store, peerId });
      if (text === "+" || text === "-") {
        await deleteIncomingCommandMessage(context);
        if (!lastEvent) {
          await sendEphemeral(vk, context, "⚠️ Матч не запущен", 3000);
          return;
        }
        await tryPlusMinus({
          vk,
          store,
          context,
          event: lastEvent,
          text,
          senderId,
        });
        return;
      }

      // Команда id временно отключена (логика в commands/showMyVkAccount.js).

      // Все остальные команды — только админ (и всегда удаляем сообщение с командой)
      const isCommandLike =
        /^rdy$/iu.test(text) ||
        /^e!$/iu.test(text) ||
        /^l(\d+)$/iu.test(text) ||
        /^p(\d+)$/iu.test(text) ||
        /^p\s+/iu.test(text) ||
        /^up(\d+)$/iu.test(text) ||
        /^up\s+/iu.test(text) ||
        /^r(\d+)$/iu.test(text) ||
        /^r\s+/iu.test(text) ||
        /^\+add\s+/iu.test(text) ||
        /^\+team\s+/iu.test(text) ||
        /^-team\s+/iu.test(text) ||
        /^\+teamdel\s+/iu.test(text) ||
        /^mvteam\s+/iu.test(text) ||
        /^mvteamq\s+/iu.test(text) ||
        /^\+1test$/iu.test(text) ||
        text.startsWith("s ") ||
        text.startsWith("start ");

      if (isCommandLike && !admin) {
        await deleteIncomingCommandMessage(context);
        await sendEphemeral(vk, context, "⛔ Нет прав", 3000);
        return;
      }

      if (/^rdy$/iu.test(text)) {
        await deleteIncomingCommandMessage(context);
        if (!lastEvent) {
          await sendEphemeral(vk, context, "⚠️ Матч не запущен", 3000);
          return;
        }
        await runRdy({ vk, context, event: lastEvent });
        return;
      }

      if (/^e!$/iu.test(text)) {
        await deleteIncomingCommandMessage(context);
        const closed = await runCloseEvent({ vk, store, peerId });
        if (!closed) {
          await sendEphemeral(vk, context, "⚠️ Матч не запущен", 3000);
        }
        return;
      }

      const startResult = await tryStartEvent({
        vk,
        store,
        context,
        text,
        peerId,
        senderId,
      });
      if (startResult) {
        await deleteIncomingCommandMessage(context);
        if (startResult === "already_started") {
          await sendEphemeral(vk, context, "⚠️ Матч уже запущен", 3000);
        }
        return;
      }

      const looksLikeStartCommand =
        /^s\s+/iu.test(text) || /^start\s+/iu.test(text);

      if (!lastEvent) {
        if (isCommandLike && !looksLikeStartCommand) {
          await deleteIncomingCommandMessage(context);
          await sendEphemeral(vk, context, "⚠️ Матч не запущен", 3000);
          return;
        }
        if (looksLikeStartCommand) {
          await deleteIncomingCommandMessage(context);
          await sendEphemeral(
            vk,
            context,
            "⚠️ Формат: s ДД.ММ.ГГГГ ЧЧ:ММ место (пример: s 04.04.2026 18:00 Сатурн) или s prof / s tr [команды через пробел или запятую]",
            5000,
          );
          return;
        }
        return;
      }

      if (await tryAddByName({ vk, store, context, event: lastEvent, text })) {
        await deleteIncomingCommandMessage(context);
        return;
      }
      if (await tryAddTeamSlots({ vk, store, context, event: lastEvent, text })) {
        await deleteIncomingCommandMessage(context);
        return;
      }
      if (await tryRemoveTeamSlot({ vk, store, context, event: lastEvent, text })) {
        await deleteIncomingCommandMessage(context);
        return;
      }
      if (await tryMovePlayerTeam({ vk, store, context, event: lastEvent, text })) {
        await deleteIncomingCommandMessage(context);
        return;
      }
      if (
        await tryAddTestPlayers({ vk, store, context, event: lastEvent, text })
      ) {
        await deleteIncomingCommandMessage(context);
        return;
      }
      if (await trySetLimit({ vk, store, context, event: lastEvent, text })) {
        await deleteIncomingCommandMessage(context);
        return;
      }
      if (await tryPayByNumber({ vk, store, context, event: lastEvent, text })) {
        await deleteIncomingCommandMessage(context);
        return;
      }
      if (
        await tryUnpayByNumber({ vk, store, context, event: lastEvent, text })
      ) {
        await deleteIncomingCommandMessage(context);
        return;
      }
      if (
        await tryRemoveByNumber({ vk, store, context, event: lastEvent, text })
      ) {
        await deleteIncomingCommandMessage(context);
        return;
      }

      // Админ отправил текст похожий на команду, но ни один обработчик не сработал — всё равно убираем сообщение из чата.
      if (isCommandLike && admin) {
        await deleteIncomingCommandMessage(context);
      }
      return;
    } catch (err) {
      // Любая ошибка в message_new не должна валить бота — только логируем.
      logError('message_new/handler', err, { peerId: context?.peerId, senderId: context?.senderId })
    }
  };
}
