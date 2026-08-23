export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const redisUrl = process.env.KV_REST_API_URL;
    const redisToken = process.env.KV_REST_API_TOKEN;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID;

    if (!redisUrl || !redisToken) {
      return res.status(500).json({
        ok: false,
        error: "Redis is not configured"
      });
    }

    const {
      orderId,
      phone
    } = req.body || {};

    if (!orderId || !phone) {
      return res.status(400).json({
        ok: false,
        error: "Order ID and phone are required"
      });
    }

    const orderResult = await redisCommand(
      redisUrl,
      redisToken,
      [
        "GET",
        `order:${orderId}`
      ]
    );

    if (!orderResult) {
      return res.status(404).json({
        ok: false,
        error: "Order not found"
      });
    }

    const order =
      typeof orderResult === "string"
        ? JSON.parse(orderResult)
        : orderResult;

    /*
    Проверяем телефон.
    Клиент не должен иметь возможность
    отменить чужой заказ только по orderId.
    */

    const savedPhone =
      normalizePhone(order.phone);

    const enteredPhone =
      normalizePhone(phone);

    if (
      !savedPhone ||
      savedPhone !== enteredPhone
    ) {
      return res.status(403).json({
        ok: false,
        error: "Order verification failed"
      });
    }

    const currentStatus =
      order.status || "new";

    /*
    Отменять можно только:
    new
    accepted
    */

    if (
      currentStatus !== "new" &&
      currentStatus !== "accepted"
    ) {
      return res.status(409).json({
        ok: false,
        error:
          "Заказ уже нельзя отменить"
      });
    }

    const updatedAt =
      new Date().toISOString();

    const updatedOrder = {
      ...order,
      status: "cancelled",
      updatedAt,
      cancelledAt: updatedAt,
      cancellationSource: "customer"
    };

    await redisCommand(
      redisUrl,
      redisToken,
      [
        "SET",
        `order:${orderId}`,
        JSON.stringify(updatedOrder),
        "EX",
        "7776000"
      ]
    );

    await redisCommand(
      redisUrl,
      redisToken,
      [
        "SET",
        `order:${orderId}:status`,
        "cancelled",
        "EX",
        "7776000"
      ]
    );

    /*
    Уведомление владельцу
    */

    if (botToken && ownerChatId) {
      const message =
        "❌ КЛИЕНТ ОТМЕНИЛ ЗАКАЗ\n\n" +
        `🔢 Заказ: ${orderId}\n` +
        `👤 Имя: ${order.name || "—"}\n` +
        `📞 Телефон: ${order.phone || "—"}\n` +
        `💰 Сумма: ${Number(order.total || 0).toLocaleString("ru-RU")} so'm`;

      try {
        await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              chat_id: ownerChatId,
              text: message
            })
          }
        );
      } catch (telegramError) {
        console.error(
          "TELEGRAM CANCEL ERROR:",
          telegramError
        );
      }
    }

    return res.status(200).json({
      ok: true,
      orderId,
      status: "cancelled"
    });

  } catch (error) {
    console.error(
      "ORDER CANCEL ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "Internal server error"
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


/*
==========================================
PHONE
==========================================
*/

function normalizePhone(value) {
  return String(value || "")
    .replace(/\D/g, "");
}
