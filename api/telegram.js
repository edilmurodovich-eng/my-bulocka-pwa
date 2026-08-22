export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    const redisUrl = process.env.KV_REST_API_URL;
    const redisToken = process.env.KV_REST_API_TOKEN;

    if (!token) {
      return res.status(500).json({
        ok: false,
        error: "Telegram bot token is not configured"
      });
    }

    if (!redisUrl || !redisToken) {
      return res.status(500).json({
        ok: false,
        error: "Redis is not configured"
      });
    }

    const body = req.body;

    /*
    ==========================================
    1. КЛИЕНТ НАЖАЛ START В TELEGRAM
    ==========================================
    */

    if (body?.message?.text) {

      const message = body.message;

      const chatId = message.chat?.id;

      const text = String(message.text).trim();

      /*
      Telegram передаёт:

      /start connect
      */

      if (
        text === "/start connect" ||
        text === "/start"
      ) {

        const user = message.from || {};

        const firstName =
          user.first_name || "";

        const username =
          user.username || "";

        /*
        Сохраняем клиента в Redis
        */

        const redisKey =
          `telegram:client:${chatId}`;

        const redisData = {
          telegramId: chatId,
          firstName,
          username,
          connectedAt: new Date().toISOString()
        };

        await fetch(
          redisUrl,
          {
            method: "POST",

            headers: {
              "Authorization":
                `Bearer ${redisToken}`,

              "Content-Type":
                "application/json"
            },

            body: JSON.stringify([
              "SET",
              redisKey,
              JSON.stringify(redisData)
            ])
          }
        );

        /*
        Ответ клиенту
        */

        await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              chat_id: chatId,

              text:
                "🥐 Добро пожаловать в «Моя Булочка»!\n\n" +
                "✅ Telegram успешно подключён.\n\n" +
                "Теперь вы сможете получать уведомления " +
                "о статусе вашего заказа."
            })
          }
        );

        return res.status(200).json({
          ok: true
        });
      }
    }

    /*
    ==========================================
    2. НАЖАТИЕ КНОПКИ СТАТУСА
    ==========================================
    */

    if (body?.callback_query) {

      const callback =
        body.callback_query;

      const callbackId =
        callback.id;

      const chatId =
        callback.message?.chat?.id;

      const messageId =
        callback.message?.message_id;

      const data =
        callback.data;

      let status = "";

      let nextButton = null;

      if (data === "status:accepted") {

        status =
          "🟢 Статус: Принят";

        nextButton = {
          inline_keyboard: [
            [
              {
                text: "👨‍🍳 Готовится",
                callback_data:
                  "status:preparing"
              }
            ]
          ]
        };

      }

      else if (
        data === "status:preparing"
      ) {

        status =
          "🟡 Статус: Готовится";

        nextButton = {
          inline_keyboard: [
            [
              {
                text: "📦 Готов",
                callback_data:
                  "status:ready"
              }
            ]
          ]
        };

      }

      else if (
        data === "status:ready"
      ) {

        status =
          "🔵 Статус: Готов";

        nextButton = {
          inline_keyboard: [
            [
              {
                text: "🚚 Доставлен",
                callback_data:
                  "status:delivered"
              }
            ]
          ]
        };

      }

      else if (
        data === "status:delivered"
      ) {

        status =
          "🟣 Статус: Доставлен";

        nextButton = {
          inline_keyboard: []
        };

      }

      else {

        return res.status(200).json({
          ok: true
        });

      }

      /*
      Убираем загрузку кнопки
      */

      await fetch(
        `https://api.telegram.org/bot${token}/answerCallbackQuery`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            callback_query_id:
              callbackId
          })
        }
      );

      /*
      Меняем кнопки у владельца
      */

      if (chatId && messageId) {

        await fetch(
          `https://api.telegram.org/bot${token}/editMessageReplyMarkup`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              chat_id: chatId,

              message_id: messageId,

              reply_markup:
                nextButton
            })
          }
        );

        /*
        Показываем новый статус
        */

        await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              chat_id: chatId,
              text: status
            })
          }
        );
      }

      return res.status(200).json({
        ok: true
      });
    }

    return res.status(200).json({
      ok: true
    });

  } catch (error) {

    console.error(
      "TELEGRAM WEBHOOK ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
