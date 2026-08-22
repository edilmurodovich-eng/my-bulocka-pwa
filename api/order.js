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
      promo,
      telegramId
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
      telegramId: telegramId || null,
      status: "new",
      createdAt: new Date().toISOString()
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
    ФОРМИРУЕМ ЗАКАЗ ДЛЯ TELEGRAM
    ==========================================
    */

    let orderText = "";

    items.forEach((item) => {

      const itemTotal =
        Number(item.price || 0) *
        Number(item.quantity || 0);

      orderText +=
        `• ${item.name} — ${item.quantity} шт.`;

      if (itemTotal > 0) {
        orderText +=
          ` — ${itemTotal.toLocaleString("ru-RU")} so'm`;
      }

      orderText += "\n";
    });

    let message =
      "🥐 НОВЫЙ ЗАКАЗ — «МОЯ БУЛОЧКА»\n\n" +

      `🔢 Заказ: ${orderId}\n\n` +

      `👤 Имя: ${name}\n` +
      `📞 Телефон: ${phone}\n` +
      `📍 Адрес: ${address}\n`;

    if (comment) {
      message +=
        `📝 Комментарий: ${comment}\n`;
    }

    message +=
      "\n🛒 ЗАКАЗ:\n" +
      orderText;

    if (promo) {
      message +=
        "\n🎁 Кофе бесплатно по акции";
    }

    message +=
      "\n\n" +
      `💰 Итого: ${Number(total || 0).toLocaleString("ru-RU")} so'm`;

    /*
    ==========================================
    КНОПКА "ПРИНЯТЬ"
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

    const telegramResponse = await fetch(
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

      /*
      Если Telegram не принял сообщение,
      удаляем сохранённый заказ.
      */

      await redisCommand(
        redisUrl,
        redisToken,
        [
          "DEL",
          `order:${orderId}`
        ]
      );

      return res.status(500).json({
        ok: false,
        error: "Telegram API error"
      });
    }

    /*
    ==========================================
    СОХРАНЯЕМ TELEGRAM MESSAGE ID
    ==========================================
    */

    orderData.telegramMessageId =
      telegramData.result.message_id;

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
    ОТВЕТ САЙТУ
    ==========================================
    */

    return res.status(200).json({
      ok: true,
      orderId,
      status: "new",
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
REDIS COMMAND
==========================================
*/

async function redisCommand(
  url,
  token,
  command
) {

  const response =
    await fetch(url, {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${token}`,

        "Content-Type":
          "application/json"
      },

      body: JSON.stringify(command)
    });

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
