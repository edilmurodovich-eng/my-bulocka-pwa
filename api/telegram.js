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
    ПОЛЬЗОВАТЕЛЬ НАЖАЛ START
    ==========================================
    */

    if (body?.message) {
      const message = body.message;
      const chatId = message.chat?.id;
      const text = String(message.text || "").trim();

      if (text.startsWith("/start")) {

        const parts = text.split(/\s+/);
        const code = parts[1] || null;

        const user = message.from || {};

        /*
        ------------------------------------------
        ЕСЛИ ЕСТЬ КОД ПОДКЛЮЧЕНИЯ
        ------------------------------------------
        */

        if (code) {

          const connectKey =
            `connect:${code}`;

          const connectValue =
            await redisCommand(
              redisUrl,
              redisToken,
              [
                "GET",
                connectKey
              ]
            );

          if (connectValue) {

            const clientData = {
              telegramId: chatId,
              firstName:
                user.first_name || "",
              lastName:
                user.last_name || "",
              username:
                user.username || "",
              connectedAt:
                new Date().toISOString()
            };

            /*
            Сохраняем клиента
            */

            await redisCommand(
              redisUrl,
              redisToken,
              [
                "SET",
                `telegram:client:${chatId}`,
                JSON.stringify(clientData)
              ]
            );

            /*
            Связываем код с Telegram ID
            */

            await redisCommand(
              redisUrl,
              redisToken,
              [
                "SET",
                connectKey,
                JSON.stringify({
                  telegramId: chatId,
                  connected: true,
                  connectedAt:
                    new Date().toISOString()
                }),
                "EX",
                "3600"
              ]
            );

            await sendTelegram(
              token,
              chatId,
              "🥐 «Моя Булочка»\n\n" +
              "✅ Telegram успешно подключён!\n\n" +
              "Теперь вы сможете получать уведомления " +
              "о статусе своих заказов."
            );

            return res.status(200).json({
              ok: true,
              connected: true
            });
          }
        }

        /*
        ------------------------------------------
        Обычный /start без кода
        ------------------------------------------
        */

        await sendTelegram(
          token,
          chatId,
          "🥐 Добро пожаловать в «Моя Булочка»!\n\n" +
          "Чтобы подключить уведомления о заказах, " +
          "откройте кнопку подключения Telegram " +
          "в приложении."
        );

        return res.status(200).json({
          ok: true
        });
      }
    }

    /*
    ==========================================
    КНОПКИ СТАТУСА ЗАКАЗА
    ==========================================
    */

    if (body?.callback_query) {

      const callback =
        body.callback_query;

      const callbackId =
        callback.id;

      const ownerChatId =
        callback.message?.chat?.id;

      const messageId =
        callback.message?.message_id;

      const callbackData =
        String(callback.data || "");

      const parts =
        callbackData.split(":");

      if (
        parts.length < 3 ||
        parts[0] !== "status"
      ) {
        return res.status(200).json({
          ok: true
        });
      }

      const action = parts[1];

      const orderId =
        parts.slice(2).join(":");

      /*
      Получаем заказ
      */

      const orderRaw =
        await redisCommand(
          redisUrl,
          redisToken,
          [
            "GET",
            `order:${orderId}`
          ]
        );

      if (!orderRaw) {

        await answerCallback(
          token,
          callbackId,
          "Заказ не найден"
        );

        return res.status(200).json({
          ok: true
        });
      }

      let order;

      try {
        order =
          typeof orderRaw === "string"
            ? JSON.parse(orderRaw)
            : orderRaw;
      } catch {
        return res.status(500).json({
          ok: false,
          error: "Invalid order data"
        });
      }

      let statusCode = "";
      let statusText = "";
      let nextButton = null;

      /*
      ------------------------------------------
      ПРИНЯТ
      ------------------------------------------
      */

      if (action === "accepted") {

        statusCode = "accepted";

        statusText =
          "🟢 Заказ принят";

        nextButton = {
          inline_keyboard: [
            [
              {
                text: "👨‍🍳 Готовится",
                callback_data:
                  `status:preparing:${orderId}`
              }
            ]
          ]
        };
      }

      /*
      ------------------------------------------
      ГОТОВИТСЯ
      ------------------------------------------
      */

      else if (action === "preparing") {

        statusCode = "preparing";

        statusText =
          "🟡 Заказ готовится";

        nextButton = {
          inline_keyboard: [
            [
              {
                text: "📦 Готов",
                callback_data:
                  `status:ready:${orderId}`
              }
            ]
          ]
        };
      }

      /*
      ------------------------------------------
      ГОТОВ
      ------------------------------------------
      */

      else if (action === "ready") {

        statusCode = "ready";

        statusText =
          "🔵 Заказ готов";

        nextButton = {
          inline_keyboard: [
            [
              {
                text: "🚚 Доставлен",
                callback_data:
                  `status:delivered:${orderId}`
              }
            ]
          ]
        };
      }

      /*
      ------------------------------------------
      ДОСТАВЛЕН
      ------------------------------------------
      */

      else if (action === "delivered") {

        statusCode = "delivered";

        statusText =
          "🟣 Заказ доставлен";

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
      ==========================================
      СОХРАНЯЕМ СТАТУС
      ==========================================
      */

      order.status = statusCode;

      order.updatedAt =
        new Date().toISOString();

      await redisCommand(
        redisUrl,
        redisToken,
        [
          "SET",
          `order:${orderId}`,
          JSON.stringify(order),
          "EX",
          "604800"
        ]
      );

      /*
      ==========================================
      ОТВЕЧАЕМ НА НАЖАТИЕ КНОПКИ
      ==========================================
      */

      await answerCallback(
        token,
        callbackId,
        statusText
      );

      /*
      ==========================================
      МЕНЯЕМ КНОПКУ У ВЛАДЕЛЬЦА
      ==========================================
      */

      if (ownerChatId && messageId) {

        await fetch(
          `https://api.telegram.org/bot${token}/editMessageReplyMarkup`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              chat_id: ownerChatId,
              message_id: messageId,
              reply_markup: nextButton
            })
          }
        );
      }

      /*
      ==========================================
      УВЕДОМЛЯЕМ ВЛАДЕЛЬЦА
      ==========================================
      */

      await sendTelegram(
        token,
        ownerChatId,
        `${statusText}\n\n🔢 Заказ: ${orderId}`
      );

      /*
      ==========================================
      УВЕДОМЛЯЕМ КЛИЕНТА
      ==========================================
      */

      if (order.telegramId) {

        let clientMessage = "";

        if (statusCode === "accepted") {

          clientMessage =
            `🟢 Ваш заказ ${orderId} принят!\n\n` +
            "🥐 Мы начинаем его готовить.";

        }

        else if (statusCode === "preparing") {

          clientMessage =
            `👨‍🍳 Ваш заказ ${orderId} готовится!\n\n` +
            "Совсем скоро будет готов.";

        }

        else if (statusCode === "ready") {

          clientMessage =
            `📦 Ваш заказ ${orderId} готов!\n\n` +
            "Можно забирать или ожидать доставку.";

        }

        else if (statusCode === "delivered") {

          clientMessage =
            `🚚 Ваш заказ ${orderId} доставлен!\n\n` +
            "Спасибо, что выбрали «Моя Булочка»! 🥐❤️";
        }

        if (clientMessage) {

          await sendTelegram(
            token,
            order.telegramId,
            clientMessage
          );
        }
      }

      return res.status(200).json({
        ok: true,
        orderId,
        status: statusCode
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


/*
==========================================
REDIS
==========================================
*/

async function redisCommand(
  url,
  token,
  command
) {

  const response =
    await fetch(
      url,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify(command)
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    console.error(
      "REDIS ERROR:",
      data
    );

    throw new Error(
      "Redis request failed"
    );
  }

  return data.result;
}


/*
==========================================
TELEGRAM SEND
==========================================
*/

async function sendTelegram(
  token,
  chatId,
  text
) {

  const response =
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
          text
        })
      }
    );

  const data =
    await response.json();

  if (!data.ok) {

    console.error(
      "TELEGRAM SEND ERROR:",
      data
    );
  }

  return data;
}


/*
==========================================
CALLBACK
==========================================
*/

async function answerCallback(
  token,
  callbackId,
  text
) {

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
          callbackId,

        text,

        show_alert: false
      })
    }
  );
}
