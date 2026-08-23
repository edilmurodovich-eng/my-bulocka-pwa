import crypto from "crypto";

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
      promo,
      telegramConnectCode
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
    СЕРВЕРНЫЕ ЦЕНЫ
    ==========================================
    */

    const PRICE_LIST = {
      1: 4000,
      2: 3500,
      3: 5000,
      4: 6000,
      5: 7000,
      6: 6000,
      7: 9000,
      8: 12000,
      9: 4000,
      10: 2000
    };

    const PRODUCT_NAMES = {
      1: "Sosiskali bulochka",
      2: "Vatrushka",
      3: "Makli bulochka",
      4: "Yong'oqli bulochka",
      5: "Shokoladli bulochka",
      6: "Jemli bulochka",
      7: "Hotdog",
      8: "Gamburger",
      9: "Kofe",
      10: "Choy"
    };

    const BUN_IDS = [1, 2, 3, 4, 5, 6];

    /*
    ==========================================
    ПРОВЕРЯЕМ ТОВАРЫ
    ==========================================
    */

    const normalizedItems = [];

    let bunCount = 0;

    for (const item of items) {
      const id = Number(item.id);
      const quantity = Number(item.quantity);

      if (!PRICE_LIST[id]) {
        return res.status(400).json({
          ok: false,
          error: `Unknown product: ${id}`
        });
      }

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 100
      ) {
        return res.status(400).json({
          ok: false,
          error: "Invalid quantity"
        });
      }

      if (BUN_IDS.includes(id)) {
        bunCount += quantity;
      }

      normalizedItems.push({
        id,
        name: PRODUCT_NAMES[id],
        quantity,
        price: PRICE_LIST[id]
      });
    }

    /*
    ==========================================
    ПРОМО
    09:00 - 11:00
    2 булочки = кофе бесплатно
    ==========================================
    */

    const now = new Date();

    const minutes =
      now.getHours() * 60 +
      now.getMinutes();

    const promoTime =
      minutes >= 540 &&
      minutes < 660;

    const coffeeQuantity =
      normalizedItems
        .filter(item => item.id === 9)
        .reduce(
          (sum, item) => sum + item.quantity,
          0
        );

    const promoActive =
      Boolean(promo) &&
      promoTime &&
      bunCount >= 2 &&
      coffeeQuantity > 0;

    /*
    ==========================================
    СЧИТАЕМ ИТОГ ТОЛЬКО НА СЕРВЕРЕ
    ==========================================
    */

    let total = 0;

    for (const item of normalizedItems) {
      total +=
        item.price *
        item.quantity;
    }

    let freeCoffee = 0;

    if (promoActive) {
      freeCoffee =
        Math.min(
          coffeeQuantity,
          Math.floor(bunCount / 2)
        );

      total -=
        freeCoffee *
        PRICE_LIST[9];
    }

    total = Math.max(
      total,
      0
    );

    /*
    ==========================================
    НОМЕР ЗАКАЗА
    ==========================================
    */

    const orderId =
      "MB-" +
      Date.now()
        .toString(36)
        .toUpperCase() +
      "-" +
      crypto
        .randomBytes(2)
        .toString("hex")
        .toUpperCase();

    /*
    ==========================================
    TELEGRAM КЛИЕНТА
    ==========================================
    */

    let customerTelegramId = null;

    if (telegramConnectCode) {
      const telegramResult =
        await redisCommand(
          redisUrl,
          redisToken,
          [
            "GET",
            `connect:${telegramConnectCode}`
          ]
        );

      if (
        telegramResult &&
        telegramResult !== "waiting"
      ) {
        customerTelegramId =
          String(telegramResult);
      }
    }

    /*
    ==========================================
    ДАННЫЕ ЗАКАЗА
    ==========================================
    */

    const orderData = {
      orderId,

      name:
        String(name).slice(0, 100),

      phone:
        String(phone).slice(0, 50),

      address:
        String(address).slice(0, 300),

      comment:
        String(comment || "").slice(0, 500),

      items:
        normalizedItems,

      subtotal:
        total +
        freeCoffee * PRICE_LIST[9],

      discount:
        freeCoffee * PRICE_LIST[9],

      total,

      promo:
        promoActive,

      freeCoffee,

      status:
        "new",

      createdAt:
        new Date().toISOString(),

      updatedAt:
        new Date().toISOString(),

      telegramId:
        customerTelegramId
    };

    /*
    ==========================================
    СОХРАНЯЕМ ЗАКАЗ

    90 дней вместо 7 дней,
    чтобы бухгалтерия имела историю
    ==========================================
    */

    await redisCommand(
      redisUrl,
      redisToken,
      [
        "SET",
        `order:${orderId}`,
        JSON.stringify(orderData),
        "EX",
        "7776000"
      ]
    );

    /*
    ==========================================
    ИНДЕКС ЗАКАЗОВ
    ==========================================
    */

    await redisCommand(
      redisUrl,
      redisToken,
      [
        "LPUSH",
        "orders:index",
        orderId
      ]
    );

    /*
    ==========================================
    TELEGRAM
    ==========================================
    */

    if (customerTelegramId) {
      await redisCommand(
        redisUrl,
        redisToken,
        [
          "SET",
          `order:${orderId}:chat`,
          String(customerTelegramId),
          "EX",
          "7776000"
        ]
      );
    }

    /*
    ==========================================
    ТЕКСТ ЗАКАЗА
    ==========================================
    */

    let orderText = "";

    normalizedItems.forEach(item => {
      const free =
        item.id === 9 &&
        freeCoffee > 0
          ? " 🎁"
          : "";

      orderText +=
        `• ${item.name} — ${item.quantity} шт. × ${item.price.toLocaleString("ru-RU")} so'm${free}\n`;
    });

    /*
    ==========================================
    TELEGRAM OWNER MESSAGE
    ==========================================
    */

    let message =
      "🥐 НОВЫЙ ЗАКАЗ — «БУЛОЧНАЯ»\n\n" +

      `🔢 Заказ: ${orderId}\n` +

      `👤 Имя: ${orderData.name}\n` +

      `📞 Телефон: ${orderData.phone}\n` +

      `📍 Адрес: ${orderData.address}\n\n` +

      "🛒 ЗАКАЗ:\n" +

      orderText;

    if (freeCoffee > 0) {
      message +=
        `\n🎁 Бесплатный кофе: ${freeCoffee} шт.`;
    }

    if (orderData.discount > 0) {
      message +=
        `\n💸 Скидка: ${orderData.discount.toLocaleString("ru-RU")} so'm`;
    }

    if (orderData.comment) {
      message +=
        `\n\n📝 Комментарий: ${orderData.comment}`;
    }

    message +=
      `\n\n💰 Итого: ${total.toLocaleString("ru-RU")} so'm`;

    /*
    ==========================================
    КНОПКА ПРИНЯТЬ
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
    TELEGRAM
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
            chat_id:
              ownerChatId,

            text:
              message,

            reply_markup:
              keyboard
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
      orderId,
      total,
      messageId:
        telegramData.result.message_id,

      telegramConnected:
        Boolean(customerTelegramId)
    });

  } catch (error) {
    console.error(
      "ORDER API ERROR:",
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
