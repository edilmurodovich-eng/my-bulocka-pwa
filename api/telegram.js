exexport default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    const redisUrl =
      process.env.KV_REST_API_URL;

    const redisToken =
      process.env.KV_REST_API_TOKEN;

    if (!token) {
      return res.status(500).json({
        ok: false,
        error: "TELEGRAM_BOT_TOKEN is missing"
      });
    }

    if (!redisUrl || !redisToken) {
      return res.status(500).json({
        ok: false,
        error: "Redis is not configured"
      });
    }

    const update = req.body;

    console.log(
      "TELEGRAM UPDATE:",
      JSON.stringify(update)
    );


    /*
    ==========================================
    START / ПОДКЛЮЧЕНИЕ TELEGRAM
    ==========================================
    */

    if (update.message) {

      const message =
        update.message;

      const chatId =
        message.chat.id;

      const text =
        message.text || "";


      if (text.startsWith("/start")) {

        const parts =
          text.trim().split(/\s+/);

        const code =
          parts[1];


        if (!code) {

          await telegramRequest(
            token,
            "sendMessage",
            {
              chat_id: chatId,

              text:
                "❌ Код подключения не найден.\n\n" +
                "Вернитесь в приложение «Моя Булочка» " +
                "и нажмите «Подключить Telegram»."
            }
          );

          return res.status(200).json({
            ok: true
          });

        }


        /*
        ======================================
        ПРОВЕРЯЕМ КОД
        ======================================
        */

        const redisResult =
          await redisCommand(
            redisUrl,
            redisToken,
            [
              "GET",
              `connect:${code}`
            ]
          );


        console.log(
          "REDIS CONNECT RESULT:",
          JSON.stringify(redisResult)
        );


        /*
        ======================================
        СОХРАНЯЕМ TELEGRAM
        ======================================
        */

        await redisCommand(
          redisUrl,
          redisToken,
          [
            "SET",
            `telegram:code:${code}`,
            String(chatId),
            "EX",
            "2592000"
          ]
        );


        await redisCommand(
          redisUrl,
          redisToken,
          [
            "SET",
            `telegram:chat:${chatId}`,
            code,
            "EX",
            "2592000"
          ]
        );


        await redisCommand(
          redisUrl,
          redisToken,
          [
            "SET",
            `connect:${code}`,
            String(chatId),
            "EX",
            "2592000"
          ]
        );


        await telegramRequest(
          token,
          "sendMessage",
          {
            chat_id: chatId,

            text:
              "✅ Telegram успешно подключён!\n\n" +
              "Теперь вы будете получать уведомления " +
              "о статусе ваших заказов в «Моя Булочка»."
          }
        );


        return res.status(200).json({
          ok: true
        });

      }

    }


    /*
    ==========================================
    CALLBACK КНОПОК
    ==========================================
    */

    if (update.callback_query) {

      const callback =
        update.callback_query;

      const callbackId =
        callback.id;

      const callbackData =
        callback.data || "";

      const message =
        callback.message;


      /*
      Сразу отвечаем Telegram,
      чтобы кнопка не зависала
      */

      await telegramRequest(
        token,
        "answerCallbackQuery",
        {
          callback_query_id:
            callbackId
        }
      );


      if (!message) {

        return res.status(200).json({
          ok: true
        });

      }


      const ownerChatId =
        message.chat.id;

      const messageId =
        message.message_id;


      /*
      ========================================
      РАЗБИРАЕМ CALLBACK
      ========================================

      status:accepted:MB-123

      */

      const parts =
        callbackData.split(":");

      const action =
        parts[1];

      const orderId =
        parts.slice(2).join(":");


      console.log(
        "ACTION:",
        action
      );

      console.log(
        "ORDER ID:",
        orderId
      );


      /*
      ========================================
      ПОЛУЧАЕМ ЗАКАЗ ИЗ REDIS
      ========================================
      */

      const orderResult =
        await redisCommand(
          redisUrl,
          redisToken,
          [
            "GET",
            `order:${orderId}`
          ]
        );


      console.log(
        "ORDER RESULT:",
        JSON.stringify(orderResult)
      );


      let order = null;


      if (
        orderResult &&
        orderResult.result
      ) {

        try {

          order =
            JSON.parse(
              orderResult.result
            );

        } catch (e) {

          console.error(
            "ORDER JSON ERROR:",
            e
          );

        }

      }


      /*
      ========================================
      НАХОДИМ TELEGRAM КЛИЕНТА
      ========================================
      */

      let customerChatId = null;


      if (
        order &&
        order.telegramConnectCode
      ) {

        const customerResult =
          await redisCommand(
            redisUrl,
            redisToken,
            [
              "GET",
              `telegram:code:${order.telegramConnectCode}`
            ]
          );


        customerChatId =
          customerResult.result || null;


        console.log(
          "CUSTOMER CHAT ID:",
          customerChatId
        );


        /*
        Сохраняем связь
        order → Telegram
        */

        if (customerChatId) {

          await redisCommand(
            redisUrl,
            redisToken,
            [
              "SET",
              `order:${orderId}:chat`,
              String(customerChatId),
              "EX",
              "604800"
            ]
          );

        }

      }


      /*
      ========================================
      Если ранее уже была сохранена связь
      ========================================
      */

      if (!customerChatId) {

        const savedChatResult =
          await redisCommand(
            redisUrl,
            redisToken,
            [
              "GET",
              `order:${orderId}:chat`
            ]
          );


        customerChatId =
          savedChatResult.result || null;

      }


      /*
      ========================================
      ПРИНЯТ
      ========================================
      */

      if (action === "accepted") {

        await updateOrderStatus(
          redisUrl,
          redisToken,
          orderId,
          "accepted"
        );


        const oldText =
          message.text || "";


        let newText =
          oldText;


        if (
          !oldText.includes(
            "✅ ЗАКАЗ ПРИНЯТ"
          )
        ) {

          newText =
            oldText +
            "\n\n" +
            "✅ ЗАКАЗ ПРИНЯТ";

        }


        const keyboard = {

          inline_keyboard: [

            [
              {
                text:
                  "✅ Заказ принят",

                callback_data:
                  `status:accepted_already:${orderId}`
              }
            ],

            [
              {
                text:
                  "🍳 Готовится",

                callback_data:
                  `status:cooking:${orderId}`
              }
            ]

          ]

        };


        await telegramRequest(
          token,
          "editMessageText",
          {
            chat_id:
              ownerChatId,

            message_id:
              messageId,

            text:
              newText,

            reply_markup:
              keyboard
          }
        );


        /*
        Уведомляем клиента
        */

        if (customerChatId) {

          await telegramRequest(
            token,
            "sendMessage",
            {
              chat_id:
                customerChatId,

              text:
                `🥐 Заказ ${orderId}\n\n` +
                "✅ Ваш заказ принят!\n\n" +
                "Мы начали его обработку."
            }
          );

        } else {

          console.log(
            "CUSTOMER TELEGRAM NOT FOUND"
          );

        }


        return res.status(200).json({
          ok: true
        });

      }


      /*
      ========================================
      ГОТОВИТСЯ
      ========================================
      */

      if (action === "cooking") {

        await updateOrderStatus(
          redisUrl,
          redisToken,
          orderId,
          "cooking"
        );


        const oldText =
          message.text || "";


        const newText =
          oldText +
          (
            oldText.includes(
              "🍳 ЗАКАЗ ГОТОВИТСЯ"
            )
              ? ""
              : "\n\n🍳 ЗАКАЗ ГОТОВИТСЯ"
          );


        const keyboard = {

          inline_keyboard: [

            [
              {
                text:
                  "🍳 Готовится",

                callback_data:
                  `status:cooking_already:${orderId}`
              }
            ],

            [
              {
                text:
                  "🛵 Передан курьеру",

                callback_data:
                  `status:courier:${orderId}`
              }
            ]

          ]

        };


        await telegramRequest(
          token,
          "editMessageText",
          {
            chat_id:
              ownerChatId,

            message_id:
              messageId,

            text:
              newText,

            reply_markup:
              keyboard
          }
        );


        if (customerChatId) {

          await telegramRequest(
            token,
            "sendMessage",
            {
              chat_id:
                customerChatId,

              text:
                `🥐 Заказ ${orderId}\n\n` +
                "🍳 Ваш заказ готовится!"
            }
          );

        }


        return res.status(200).json({
          ok: true
        });

      }


      /*
      ========================================
      КУРЬЕР
      ========================================
      */

      if (action === "courier") {

        await updateOrderStatus(
          redisUrl,
          redisToken,
          orderId,
          "courier"
        );


        const oldText =
          message.text || "";


        const newText =
          oldText +
          (
            oldText.includes(
              "🛵 ПЕРЕДАН КУРЬЕРУ"
            )
              ? ""
              : "\n\n🛵 ПЕРЕДАН КУРЬЕРУ"
          );


        const keyboard = {

          inline_keyboard: [

            [
              {
                text:
                  "🛵 Передан курьеру",

                callback_data:
                  `status:courier_already:${orderId}`
              }
            ],

            [
              {
                text:
                  "✅ Доставлен",

                callback_data:
                  `status:delivered:${orderId}`
              }
            ]

          ]

        };


        await telegramRequest(
          token,
          "editMessageText",
          {
            chat_id:
              ownerChatId,

            message_id:
              messageId,

            text:
              newText,

            reply_markup:
              keyboard
          }
        );


        if (customerChatId) {

          await telegramRequest(
            token,
            "sendMessage",
            {
              chat_id:
                customerChatId,

              text:
                `🥐 Заказ ${orderId}\n\n` +
                "🛵 Заказ передан курьеру!"
            }
          );

        }


        return res.status(200).json({
          ok: true
        });

      }


      /*
      ========================================
      ДОСТАВЛЕН
      ========================================
      */

      if (action === "delivered") {

        await updateOrderStatus(
          redisUrl,
          redisToken,
          orderId,
          "delivered"
        );


        const oldText =
          message.text || "";


        const newText =
          oldText +
          (
            oldText.includes(
              "✅ ЗАКАЗ ДОСТАВЛЕН"
            )
              ? ""
              : "\n\n✅ ЗАКАЗ ДОСТАВЛЕН"
          );


        const keyboard = {

          inline_keyboard: [

            [
              {
                text:
                  "✅ Заказ доставлен",

                callback_data:
                  `status:delivered_already:${orderId}`
              }
            ]

          ]

        };


        await telegramRequest(
          token,
          "editMessageText",
          {
            chat_id:
              ownerChatId,

            message_id:
              messageId,

            text:
              newText,

            reply_markup:
              keyboard
          }
        );


        if (customerChatId) {

          await telegramRequest(
            token,
            "sendMessage",
            {
              chat_id:
                customerChatId,

              text:
                `🥐 Заказ ${orderId}\n\n` +
                "✅ Заказ доставлен!\n\n" +
                "Спасибо, что выбрали «Моя Булочка» ❤️"
            }
          );

        }


        return res.status(200).json({
          ok: true
        });

      }

    }


    return res.status(200).json({
      ok: true
    });


  } catch (error) {

    console.error(
      "TELEGRAM ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        error.message
    });

  }

}


/*
==========================================
ОБНОВЛЕНИЕ СТАТУСА ЗАКАЗА
==========================================
*/

async function updateOrderStatus(
  redisUrl,
  redisToken,
  orderId,
  status
) {

  /*
  Сохраняем простой статус
  */

  await redisCommand(
    redisUrl,
    redisToken,
    [
      "SET",
      `order:${orderId}:status`,
      status,
      "EX",
      "604800"
    ]
  );


  /*
  Обновляем сам заказ
  */

  const result =
    await redisCommand(
      redisUrl,
      redisToken,
      [
        "GET",
        `order:${orderId}`
      ]
    );


  if (
    result &&
    result.result
  ) {

    try {

      const order =
        JSON.parse(
          result.result
        );


      order.status =
        status;

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

    } catch (error) {

      console.error(
        "ORDER STATUS UPDATE ERROR:",
        error
      );

    }

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


  return data;
}


/*
==========================================
TELEGRAM
==========================================
*/

async function telegramRequest(
  token,
  method,
  body
) {

  const response =
    await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(body)
      }
    );


  const data =
    await response.json();


  if (!data.ok) {

    console.error(
      `Telegram ${method} error:`,
      data
    );

  }


  return data;
}
