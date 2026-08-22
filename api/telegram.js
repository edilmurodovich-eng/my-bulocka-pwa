export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    const redisUrl =
      process.env.KV_REST_API_URL;

    const redisToken =
      process.env.KV_REST_API_TOKEN;

    if (!token || !redisUrl || !redisToken) {
      return res.status(500).json({
        ok: false,
        error: "Telegram or Redis settings are missing"
      });
    }

    /*
    ==========================================
    TELEGRAM WEBHOOK
    ==========================================
    */

    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed"
      });
    }

    const update = req.body;

    /*
    ==========================================
    ПРОВЕРЯЕМ MESSAGE
    ==========================================
    */

    const message = update?.message;

    if (!message) {
      return res.status(200).json({
        ok: true
      });
    }

    const chatId = message.chat?.id;

    const text =
      typeof message.text === "string"
        ? message.text.trim()
        : "";

    if (!chatId || !text) {
      return res.status(200).json({
        ok: true
      });
    }

    /*
    ==========================================
    /start CODE
    ==========================================
    */

    if (text.startsWith("/start")) {

      const parts =
        text.split(/\s+/);

      const code =
        parts[1];

      if (!code) {

        await sendTelegram(
          token,
          chatId,
          "🥐 Добро пожаловать в «Моя Булочка»!"
        );

        return res.status(200).json({
          ok: true
        });

      }

      /*
      Ищем код подключения
      */

      const connection =
        await redisCommand(
          redisUrl,
          redisToken,
          [
            "GET",
            `telegram:connect:${code}`
          ]
        );

      if (!connection) {

        await sendTelegram(
          token,
          chatId,
          "❌ Код подключения недействителен или устарел."
        );

        return res.status(200).json({
          ok: true
        });

      }

      /*
      ==========================================
      СОХРАНЯЕМ TELEGRAM ID
      ==========================================
      */

      await redisCommand(
        redisUrl,
        redisToken,
        [
          "SET",
          `telegram:user:${chatId}`,
          JSON.stringify({
            telegramId: chatId,
            connectedAt:
              new Date().toISOString()
          })
        ]
      );

      /*
      Также сохраняем связь
      CODE → TELEGRAM ID
      */

      await redisCommand(
        redisUrl,
        redisToken,
        [
          "SET",
          `telegram:connect:${code}`,
          JSON.stringify({
            telegramId: chatId,
            connectedAt:
              new Date().toISOString()
          }),
          "EX",
          "86400"
        ]
      );

      await sendTelegram(
        token,
        chatId,
        "🥐 «Моя Булочка»\n\n" +
        "✅ Telegram успешно подключён!\n\n" +
        "Теперь вы сможете получать уведомления " +
        "о статусе вашего заказа."
      );

      return res.status(200).json({
        ok: true,
        connected: true,
        telegramId: chatId
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
TELEGRAM SEND MESSAGE
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

    throw new Error(
      data.description ||
      "Telegram sendMessage failed"
    );
  }

  return data;
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

        body:
          JSON.stringify(command)
      }
    );

  const data =
    await response.json();

  if (!response.ok || data.error) {

    console.error(
      "REDIS ERROR:",
      data
    );

    throw new Error(
      data.error ||
      "Redis request failed"
    );
  }

  return data.result;
}
