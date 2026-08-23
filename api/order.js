import crypto from "crypto";

/*
==========================================
API: СОЗДАНИЕ ЗАКАЗА
==========================================
*/

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {

    /*
    ========================================
    ENV
    ========================================
    */

    const token =
      process.env.TELEGRAM_BOT_TOKEN;

    const ownerChatId =
      process.env.TELEGRAM_OWNER_CHAT_ID;

    const redisUrl =
      process.env.KV_REST_API_URL;

    const redisToken =
      process.env.KV_REST_API_TOKEN;


    /*
    ========================================
    ПРОВЕРКА TELEGRAM
    ========================================
    */

    if (!token || !ownerChatId) {
      return res.status(500).json({
        ok: false,
        error: "Telegram settings are not configured"
      });
    }


    /*
    ========================================
    ПРОВЕРКА REDIS
    ========================================
    */

    if (!redisUrl || !redisToken) {
      return res.status(500).json({
        ok: false,
        error: "Redis is not configured"
      });
    }


    /*
    ========================================
    BODY
    ========================================
    */

    const order = req.body;


    if (
      !order ||
      typeof order !== "object" ||
      Array.isArray(order)
    ) {
      return res.status(400).json({
        ok: false,
        error: "Invalid order"
      });
    }


    /*
    ========================================
    ДАННЫЕ
    ========================================
    */

    const {
      name,
      phone,
      address,
      comment,
      items,
      promo,
      telegramConnectCode
    } = order;


    /*
    ========================================
    ОСНОВНЫЕ ДАННЫЕ
    ========================================
    */

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


    if (items.length > 50) {
      return res.status(400).json({
        ok: false,
        error: "Too many order items"
      });
    }


    /*
    ========================================
    ЦЕНЫ
    ========================================
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


    /*
    ========================================
    НАЗВАНИЯ
    ========================================
    */

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


    /*
    ========================================
    СПОСОБ ОПЛАТЫ
    ========================================

    Поддерживаются:

    cash
    card
    cash_on_delivery
    card_on_delivery

    Если клиент ничего не отправил,
    используем cash.
    ========================================
    */

    const rawPaymentMethod =
      String(
        order.paymentMethod ||
        "cash"
      )
        .trim()
        .toLowerCase();


    const PAYMENT_METHODS = {

      cash:
        "Наличными при получении",

      card:
        "Картой при получении",

      cash_on_delivery:
        "Наличными при получении",

      card_on_delivery:
        "Картой при получении"

    };


    const paymentMethod =
      PAYMENT_METHODS[
        rawPaymentMethod
      ]
        ? (
            rawPaymentMethod ===
            "cash_on_delivery"
              ? "cash"
              : rawPaymentMethod ===
                "card_on_delivery"
                  ? "card"
                  : rawPaymentMethod
          )
        : "cash";


    const paymentMethodName =
      PAYMENT_METHODS[
        rawPaymentMethod
      ] ||
      "Наличными при получении";


    /*
    ========================================
    БУЛОЧКИ
    ========================================
    */

    const BUN_IDS = [
      1,
      2,
      3,
      4,
      5,
      6
    ];


    /*
    ========================================
    НОРМАЛИЗАЦИЯ ТОВАРОВ
    ========================================
    */

    const normalizedItems = [];

    let bunCount = 0;


    for (const item of items) {

      if (!item || typeof item !== "object") {
        return res.status(400).json({
          ok: false,
          error: "Invalid order item"
        });
      }


      const id =
        Number(item.id);

      const quantity =
        Number(item.quantity);


      /*
      --------------------------------------
      ID
      --------------------------------------
      */

      if (
        !Number.isInteger(id) ||
        !Object.prototype.hasOwnProperty.call(
          PRICE_LIST,
          id
        )
      ) {

        return res.status(400).json({
          ok: false,
          error:
            `Unknown product: ${id}`
        });

      }


      /*
      --------------------------------------
      QUANTITY
      --------------------------------------
      */

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


      /*
      --------------------------------------
      БУЛОЧКИ
      --------------------------------------
      */

      if (BUN_IDS.includes(id)) {
        bunCount += quantity;
      }


      /*
      --------------------------------------
      СЕРВЕРНЫЕ ДАННЫЕ
      --------------------------------------
      */

      normalizedItems.push({

        id,

        name:
          PRODUCT_NAMES[id],

        quantity,

        price:
          PRICE_LIST[id]

      });

    }


    /*
    ========================================
    ПРОМО
    ========================================

    09:00 - 11:00

    2 булочки =
    кофе бесплатно

    ========================================
    */

    const now =
      new Date();

    const minutes =
      now.getHours() * 60 +
      now.getMinutes();


    const promoTime =
      minutes >= 540 &&
      minutes < 660;


    /*
    ========================================
    КОФЕ
    ========================================
    */

    const coffeeQuantity =
      normalizedItems
        .filter(
          item => item.id === 9
        )
        .reduce(
          (sum, item) =>
            sum + item.quantity,
          0
        );


    /*
    ========================================
    АКЦИЯ
    ========================================
    */

    const promoActive =
      Boolean(promo) &&
      promoTime &&
      bunCount >= 2 &&
      coffeeQuantity > 0;


    /*
    ========================================
    SUBTOTAL
    ========================================
    */

    let subtotal = 0;


    for (const item of normalizedItems) {

      subtotal +=
        item.price *
        item.quantity;

    }


    /*
    ========================================
    БЕСПЛАТНЫЙ КОФЕ
    ========================================
    */

    let freeCoffee = 0;


    if (promoActive) {

      freeCoffee =
        Math.min(
          coffeeQuantity,
          Math.floor(
            bunCount / 2
          )
        );

    }


    /*
    ========================================
    СКИДКА
    ========================================
    */

    const discount =
      freeCoffee *
      PRICE_LIST[9];


    /*
    ========================================
    ИТОГО
    ========================================
    */

    const total =
      Math.max(
        subtotal - discount,
        0
      );


    /*
    ========================================
    НОМЕР ЗАКАЗА
    ========================================
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
    ========================================
    TELEGRAM КЛИЕНТА
    ========================================
    */

    let customerTelegramId = null;


    const cleanTelegramCode =
      telegramConnectCode
        ? String(
            telegramConnectCode
          )
            .trim()
            .toUpperCase()
            .slice(0, 100)
        : null;


    if (cleanTelegramCode) {

      const telegramResult =
        await redisCommand(
          redisUrl,
          redisToken,
          [
            "GET",
            `connect:${cleanTelegramCode}`
          ]
        );


      if (
        telegramResult &&
        telegramResult !== "waiting"
      ) {

        customerTelegramId =
          String(
            telegramResult
          );

      }

    }


    /*
    ========================================
    ВРЕМЯ
    ========================================
    */

    const createdAt =
      new Date().toISOString();


    /*
    ========================================
    ORDER DATA
    ========================================
    */

    const orderData = {

      orderId,


      /*
      КЛИЕНТ
      */

      name:
        String(name)
          .trim()
          .slice(0, 100),

      phone:
        String(phone)
          .trim()
          .slice(0, 50),

      address:
        String(address)
          .trim()
          .slice(0, 300),

      comment:
        String(comment || "")
          .trim()
          .slice(0, 500),


      /*
      ТОВАРЫ
      */

      items:
        normalizedItems,


      /*
      ФИНАНСЫ
      */

      subtotal,

      discount,

      total,


      /*
      ПРОМО
      */

      promo:
        promoActive,

      freeCoffee,


      /*
      ОПЛАТА
      */

      paymentMethod,

      paymentMethodName,


      /*
      TELEGRAM CODE
      */

      telegramConnectCode:
        cleanTelegramCode,


      telegramId:
        customerTelegramId,


      /*
      СТАТУС
      */

      status:
        "new",


      /*
      ДАТЫ
      */

      createdAt,

      updatedAt:
        createdAt

    };


    /*
    ========================================
    СОХРАНЯЕМ ЗАКАЗ
    ========================================
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
    ========================================
    ИНДЕКС
    ========================================
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
    ========================================
    СОХРАНЯЕМ TELEGRAM CHAT
    ========================================
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
    ========================================
    ТЕКСТ ЗАКАЗА
    ========================================
    */

    let orderText = "";


    normalizedItems.forEach(item => {

      const freeText =
        item.id === 9 &&
        freeCoffee > 0
          ? " 🎁"
          : "";


      orderText +=
        `• ${item.name} — ` +
        `${item.quantity} шт. × ` +
        `${item.price.toLocaleString("ru-RU")} so'm` +
        `${freeText}\n`;

    });


    /*
    ========================================
    TELEGRAM OWNER MESSAGE
    ========================================
    */

    let message =

      "🥐 НОВЫЙ ЗАКАЗ — «БУЛОЧНАЯ»\n\n" +

      `🔢 Заказ: ${orderId}\n` +

      `👤 Имя: ${orderData.name}\n` +

      `📞 Телефон: ${orderData.phone}\n` +

      `📍 Адрес: ${orderData.address}\n\n` +

      "🛒 ЗАКАЗ:\n" +

      orderText;


    /*
    ========================================
    ПРОМО
    ========================================
    */

    if (freeCoffee > 0) {

      message +=
        `\n🎁 Бесплатный кофе: ${freeCoffee} шт.`;

    }


    /*
    ========================================
    СКИДКА
    ========================================
    */

    if (discount > 0) {

      message +=
        `\n💸 Скидка: ` +
        `${discount.toLocaleString("ru-RU")} so'm`;

    }


    /*
    ========================================
    ОПЛАТА
    ========================================
    */

    message +=
      `\n💳 Оплата: ${paymentMethodName}`;


    /*
    ========================================
    КОММЕНТАРИЙ
    ========================================
    */

    if (orderData.comment) {

      message +=
        `\n\n📝 Комментарий: ` +
        orderData.comment;

    }


    /*
    ========================================
    ИТОГО
    ========================================
    */

    message +=
      `\n\n💰 Итого: ` +
      `${total.toLocaleString("ru-RU")} so'm`;


    /*
    ========================================
    КНОПКА
    ========================================
    */

    const keyboard = {

      inline_keyboard: [

        [
          {
            text:
              "🟢 Принять заказ",

            callback_data:
              `status:accepted:${orderId}`
          }
        ]

      ]

    };


    /*
    ========================================
    TELEGRAM
    ========================================
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


    /*
    ========================================
    TELEGRAM ERROR
    ========================================
    */

    if (!telegramData.ok) {

      console.error(
        "Telegram API error:",
        telegramData
      );

      /*
      Заказ уже сохранён.
      Возвращаем понятную ошибку.
      */

      return res.status(500).json({
        ok: false,
        error:
          "Заказ сохранён, но Telegram не смог получить уведомление",
        orderId
      });

    }


    /*
    ========================================
    УСПЕШНЫЙ ОТВЕТ
    ========================================
    */

    return res.status(200).json({

      ok: true,

      orderId,

      total,

      subtotal,

      discount,

      freeCoffee,

      paymentMethod,

      paymentMethodName,

      messageId:
        telegramData.result.message_id,

      telegramConnected:
        Boolean(
          customerTelegramId
        )

    });


  } catch (error) {

    console.error(
      "ORDER API ERROR:",
      error
    );

    return res.status(500).json({

      ok: false,

      error:
        "Internal server error"

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
