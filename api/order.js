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

    if (!token || !ownerChatId) {
      console.error("Telegram environment variables are missing");

      return res.status(500).json({
        ok: false,
        error: "Telegram settings are not configured"
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

    if (!name || !phone || !address || !Array.isArray(items)) {
      return res.status(400).json({
        ok: false,
        error: "Missing order data"
      });
    }

    let orderText = "";

    items.forEach(item => {
      orderText +=
        `${item.name} — ${item.quantity} шт.\n`;
    });

    let message =
      "🥐 НОВЫЙ ЗАКАЗ\n\n" +
      `👤 Имя: ${name}\n` +
      `📞 Телефон: ${phone}\n` +
      `📍 Адрес: ${address}\n`;

    if (comment) {
      message += `📝 Комментарий: ${comment}\n`;
    }

    message +=
      "\n🛒 ЗАКАЗ:\n" +
      orderText +
      "\n";

    if (promo) {
      message +=
        "🎁 Кофе бесплатно по акции\n";
    }

    message +=
      `\n💰 Итого: ${Number(total).toLocaleString("ru-RU")} so'm`;

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: ownerChatId,
          text: message
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

    return res.status(200).json({
      ok: true,
      messageId: telegramData.result.message_id
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
