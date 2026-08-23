import crypto from "crypto";


/*
==========================================
API: СОЗДАНИЕ ЗАКАЗА
==========================================
*/


export default async function handler(req, res) {

  /*
  ========================================
  ТОЛЬКО POST
  ========================================
  */

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

    if (
      !token ||
      !ownerChatId
    ) {

      return res.status(500).json({
        ok: false,
        error:
          "Telegram settings are not configured"
      });

    }


    /*
    ========================================
    ПРОВЕРКА REDIS
    ========================================
    */

    if (
      !redisUrl ||
      !redisToken
    ) {

      return res.status(500).json({
        ok: false,
        error:
          "Redis is not configured"
      });

    }


    /*
    ========================================
    ПОЛУЧАЕМ ЗАКАЗ
    ========================================
    */

    const order =
      req.body;


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
    ДАННЫЕ ЗАКАЗА
    ========================================
    */

    const {
      name,
      phone,
      address,
      comment,
      items,
      promo,
      telegramConnectCode,
      paymentMethod
    } = order;


    /*
    ========================================
    ПРОВЕРКА ОСНОВНЫХ ДАННЫХ
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
        error:
          "Missing order data"
      });

    }


    /*
    ========================================
    ОГРАНИЧЕНИЕ КОЛИЧЕСТВА ПОЗИЦИЙ
    ========================================
    */

    if (
      items.length > 50
    ) {

      return res.status(400).json({
        ok: false,
        error:
          "Too many order items"
      });

    }


    /*
    ========================================
    СПИСОК ЦЕН
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
    НАЗВАНИЯ ТОВАРОВ
    ========================================
    */

    const PRODUCT_NAMES = {

      1:
        "Sosiskali bulochka",

      2:
        "Vatrushka",

      3:
        "Makli bulochka",

      4:
        "Yong'oqli bulochka",

      5:
        "Shokoladli bulochka",

      6:
        "Jemli bulochka",

      7:
        "Hotdog",

      8:
        "Gamburger",

      9:
        "Kofe",

      10:
        "Choy"

    };


    /*
    ========================================
    СПОСОБЫ ОПЛАТЫ
    ========================================
    */

    const PAYMENT_METHODS = {

      cash:
        "Наличными при получении",

      card:
        "Картой при получении"

    };


    /*
    ========================================
    ПРОВЕРЯЕМ СПОСОБ ОПЛАТЫ
    ========================================
    */

    const normalizedPaymentMethod =
      PAYMENT_METHODS[
        paymentMethod
      ];


    if (
      !normalizedPaymentMethod
    ) {

      return res.status(400).json({
        ok: false,
        error:
          "Invalid payment method"
      });

    }


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


    for (
      const item of items
    ) {

      const id =
        Number(item?.id);

      const quantity =
        Number(item?.quantity);


      /*
      --------------------------------------
      ПРОВЕРКА ID
      --------------------------------------
      */

      if (
        !Number.isInteger(id) ||
        !PRICE_LIST[id]
      ) {

        return res.status(400).json({
          ok: false,
          error:
            `Unknown product: ${id}`
        });

      }


      /*
      --------------------------------------
      ПРОВЕРКА КОЛИЧЕСТВА
      --------------------------------------
      */

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 100
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "Invalid quantity"
        });

      }


      /*
      --------------------------------------
      СЧИТАЕМ БУЛОЧКИ
      --------------------------------------
      */

      if (
        BUN_IDS.includes(id)
      ) {

        bunCount +=
          quantity;

      }


      /*
      --------------------------------------
      СОХРАНЯЕМ ТОЛЬКО
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
    ПРОМО-АКЦИЯ
    ========================================

    09:00 - 11:00

    2 булочки =
    1 кофе бесплатно

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
    КОЛИЧЕСТВО КОФЕ
    ========================================
    */

    const coffeeQuantity =
      normalizedItems
        .filter(
          item =>
            item.id === 9
        )
        .reduce(
          (
            sum,
            item
          ) =>
            sum +
            item.quantity,
          0
        );


    /*
    ========================================
    АКЦИЯ АКТИВНА?
    ========================================
    */

    const promoActive =
      Boolean(promo) &&
      promoTime &&
      bunCount >= 2 &&
      coffeeQuantity > 0;


    /*
    ========================================
    СЧИТАЕМ СУММУ
    ========================================
    */

    let subtotal = 0;


    for (
      const item of normalizedItems
    ) {

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


    if (
      promoActive
    ) {

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
    ИТОГ
    ========================================
    */

    const total =
      Math.max(
        subtotal -
        discount,
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

    let customerTelegramId =
      null;


    if (
      telegramConnectCode
    ) {

      const telegramResult =
        await redisCommand(
          redisUrl,
          redisToken,
          [
            "GET",

            `connect:${telegramConnectCode}`
          ]
        );


      /*
      --------------------------------------
      Если Redis содержит waiting,
      клиент ещё не подключён
      --------------------------------------
      */

      if (
        telegramResult &&
        telegramResult !==
          "waiting"
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
      new Date()
        .toISOString();


    /*
    ========================================
    ДАННЫЕ ЗАКАЗА
    ========================================
    */

    const orderData = {

      orderId,


      /*
      --------------------------------------
      КЛИЕНТ
      --------------------------------------
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
      --------------------------------------
      ТОВАРЫ
      --------------------------------------
      */

      items:
        normalizedItems,


      /*
      --------------------------------------
      ФИНАНСЫ
      --------------------------------------
      */

      subtotal,

      discount,

      total,


      /*
      --------------------------------------
      ПРОМО
      --------------------------------------
      */

      promo:
        promoActive,

      freeCoffee,


      /*
      --------------------------------------
      ОПЛАТА
      --------------------------------------
      */

      paymentMethod,

      paymentMethodName:
        normalizedPaymentMethod,


      /*
      --------------------------------------
      СТАТУС
      --------------------------------------
      */

      status:
        "new",


      /*
      --------------------------------------
      ДАТЫ
      --------------------------------------
      */

      createdAt,

      updatedAt:
        createdAt,


      /*
      --------------------------------------
      TELEGRAM
      --------------------------------------
      */

      telegramId:
        customerTelegramId

    };


    /*
    ========================================
    СОХРАНЯЕМ ЗАКАЗ
    ========================================

    90 дней

    ========================================
    */

    await redisCommand(

      redisUrl,

      redisToken,

      [

        "SET",

        `order:${orderId}`,

        JSON.stringify(
          orderData
        ),

        "EX",

        "7776000"

      ]

    );


    /*
    ========================================
    ИНДЕКС ЗАКАЗОВ
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
    TELEGRAM CHAT
    ========================================
    */

    if (
      customerTelegramId
    ) {

      await redisCommand(

        redisUrl,

        redisToken,

        [

          "SET",

          `order:${orderId}:chat`,

          String(
            customerTelegramId
          ),

          "EX",

          "7776000"

        ]

      );

    }


    /*
    ========================================
    ФОРМИРУЕМ ТОВАРЫ
    ========================================
    */

    let orderText =
      "";


    normalizedItems.forEach(
      item => {

        /*
        ------------------------------------
        Бесплатный кофе
        ------------------------------------
        */

        let freeText =
          "";


        if (
          item.id === 9 &&
          freeCoffee > 0
        ) {

          freeText =
            " 🎁";

        }


        orderText +=

          `• ${item.name} — ` +

          `${item.quantity} шт. × ` +

          `${item.price.toLocaleString("ru-RU")} so'm` +

          `${freeText}\n`;

      }
    );


    /*
    ========================================
    СООБЩЕНИЕ ВЛАДЕЛЬЦУ
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
    БЕСПЛАТНЫЙ КОФЕ
    ========================================
    */

    if (
      freeCoffee > 0
    ) {

      message +=

        `\n🎁 Бесплатный кофе: ` +

        `${freeCoffee} шт.`;

    }


    /*
    ========================================
    СКИДКА
    ========================================
    */

    if (
      discount > 0
    ) {

      message +=

        `\n💸 Скидка: ` +

        `${discount.toLocaleString("ru-RU")} so'm`;

    }


    /*
    ========================================
    СПОСОБ ОПЛАТЫ
    ========================================
    */

    message +=

      `\n💳 Оплата: ` +

      normalizedPaymentMethod;


    /*
    ========================================
    КОММЕНТАРИЙ
    ========================================
    */

    if (
      orderData.comment
    ) {

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
    КНОПКА ПРИНЯТЬ
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
    ОТПРАВКА TELEGRAM
    ========================================
    */

    const telegramResponse =

      await fetch(

        `https://api.telegram.org/bot${token}/sendMessage`,

        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              chat_id:
                ownerChatId,

              text:
                message,

              reply_markup:
                keyboard

            })

        }

      );


    /*
    ========================================
    TELEGRAM RESPONSE
    ========================================
    */

    const telegramData =
      await telegramResponse
        .json();


    /*
    ========================================
    TELEGRAM ERROR
    ========================================
    */

    if (
      !telegramData.ok
    ) {

      console.error(
        "Telegram API error:",
        telegramData
      );


      /*
      Заказ уже сохранён.
      Поэтому не удаляем его.
      */

      return res.status(500).json({

        ok: false,

        error:
          "Telegram API error",

        orderId

      });

    }


    /*
    ========================================
    УСПЕХ
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

      paymentMethodName:
        normalizedPaymentMethod,

      messageId:
        telegramData
          .result
          .message_id,

      telegramConnected:
        Boolean(
          customerTelegramId
        )

    });


  } catch (error) {

    /*
    ========================================
    ОШИБКА
    ========================================
    */

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

        method:
          "POST",

        headers: {

          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify(
            command
          )

      }

    );


  const data =
    await response.json();


  if (
    !response.ok
  ) {

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
