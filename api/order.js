export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID;

    const redisUrl = process.env.KV_REST_API_URL;
    const redisToken = process.env.KV_REST_API_TOKEN;

    if (!token || !ownerChatId) {
      return res.status(500).json({
        ok: false,
        error: "Telegram settings are not configured"
      });
    }

    if (!redisUrl || !redisToken) {
      return res.status(500).json({
        ok: false,
        error: "Redis is not configured"
      });
    }

    const order = req.body;

    if (!order || typeof order !== "object") {
      return res.status(400).json({
        ok: false,
        error: "Invalid order"
      });
    }

    const {
      name,
      phone,
      address,
      comment,
      items,
      total,
      promo
    } = order;

    if (
      !name ||
      !phone ||
      !address ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        ok: false,
        error: "Missing order data"
      });
    }

    /*
    ==========================================
    СОЗДАЁМ НОМЕР ЗАКАЗА
    ==========================================
    */

    const orderId =
      "MB-" +
      Date.now().toString(36).toUpperCase();

    /*
    ==========================================
    СОХРАНЯЕМ ЗАКАЗ В REDIS
    ==========================================
    */

    const orderData = {
      orderId,
      name,
      phone,
      address,
      comment: comment || "",
      items,
      total: Number(total) || 0,
      promo: Boolean(promo),

      status: "new",

      createdAt: new Date().toISOString(),

      /*
      Пока Telegram ID клиента не передаём.
      Подключим его следующим этапом.
      */
      telegramId: null
    };

    await redisCommand(
      redisUrl,
      redisToken,
      [
        "SET",
        `order:${orderId}`,
        JSON.stringify(orderData),
        "EX",
        "604800"
      ]
    );

    /*
    ==========================================
    ТЕКСТ ЗАКАЗА
    ==========================================
    */

    let orderText = "";

    items.forEach((item) => {

      orderText +=
        `• ${item.name} — ${item.quantity} шт.\n`;

    });

    /*
    ==========================================
    СООБЩЕНИЕ В TELEGRAM
    ==========================================
    */

    let message =
      "🥐 НОВЫЙ ЗАКАЗ — «МОЯ БУЛОЧКА»\n\n" +

      `🔢 Заказ: ${orderId}\n` +

      `👤 Имя: ${name}\n` +

      `📞 Телефон: ${phone}\n` +

      `📍 Адрес: ${address}\n\n` +

      "🛒 ЗАКАЗ:\n" +

      orderText;

    if (promo) {

      message +=
        "\n🎁 Кофе бесплатно по акции";

    }

    if (comment) {

      message +=
        `\n\n📝 Комментарий: ${comment}`;

    }

    message +=
      `\n\n💰 Итого: ${
        Number(total).toLocaleString("ru-RU")
      } so'm`;

    /*
    ==========================================
    КНОПКА «ПРИНЯТЬ»
    ==========================================
    */

    const keyboard = {

      inline_keyboard: [

        [
          {
            text: "🟢 Принять заказ",

            callback_data:
              `status:accepted:${orderId}`
          }
        ]

      ]

    };

    /*
    ==========================================
    ОТПРАВЛЯЕМ В TELEGRAM
    ==========================================
    */

    const telegramResponse =
      await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            chat_id: ownerChatId,

            text: message,

            reply_markup: keyboard

          })

        }
      );

    const telegramData =
      await telegramResponse.json();

    if (!telegramData.ok) {

      console.error(
        "Telegram API error:",
        telegramData
      );

      return res.status(500).json({
        ok: false,
        error: "Telegram API error"
      });

    }

    /*
    ==========================================
    УСПЕХ
    ==========================================
    */

    return res.status(200).json({

      ok: true,

      orderId,

      messageId:
        telegramData.result.message_id

    });

  } catch (error) {

    console.error(
      "ORDER API ERROR:",
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

        body:
          JSON.stringify(command)

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
