export default async function handler(req, res) {
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
    START / ПОДКЛЮЧЕНИЕ КЛИЕНТА
    ==========================================
    */

    if (update.message) {

      const message =
        update.message;

      const chatId =
        message.chat.id;

      const text =
        message.text || "";


      if (
        text.startsWith("/start")
      ) {

        /*
        Получаем код после /start

        Например:

        /start Q8SHU0OT
        */

        const parts =
          text.trim().split(/\s+/);

        const code =
          parts[1];


        /*
        Если кода нет
        */

        if (!code) {

          await telegramRequest(
            token,
            "sendMessage",
            {
              chat_id:
                chatId,

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
        ИЩЕМ КОД В REDIS
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
        Если код не найден
        */

        if (
          !redisResult.result ||
          redisResult.result === "waiting"
        ) {

          /*
          Сохраняем chat_id
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


          /*
          Также сохраняем связь
          */

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


          /*
          Помечаем подключение
          */

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
              chat_id:
                chatId,

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


        /*
        ======================================
        ЕСЛИ КОД УЖЕ ПОДКЛЮЧЕН
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


        await telegramRequest(
          token,
          "sendMessage",
          {
            chat_id:
              chatId,

            text:
              "✅ Telegram уже подключён!\n\n" +
              "Вы будете получать уведомления о заказах."
          }
        );


        return res.status(200).json({
          ok: true
        });

      }

    }


    /*
    ==========================================
    НАЖАТИЕ КНОПКИ СТАТУСА
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
      Убираем индикатор загрузки
      */

      await telegramRequest(
        token,
        "answerCallbackQuery",
        {
          callback_query_id:
            callbackId
        }
      );


      /*
      ========================================
      РАЗБИРАЕМ CALLBACK
      ========================================

      status:accepted:MB-123456

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
      ПОЛУЧАЕМ CHAT ID КЛИЕНТА
      ========================================
      */

      const customerChatResult =
        await redisCommand(
          redisUrl,
          redisToken,
          [
            "GET",
            `order:${orderId}:chat`
          ]
        );


      console.log(
        "CUSTOMER CHAT RESULT:",
        JSON.stringify(
          customerChatResult
        )
      );


      const customerChatId =
        customerChatResult.result;


      /*
      ========================================
      ПРИНЯТЬ ЗАКАЗ
      ========================================
      */

      if (
        action ===
        "accepted"
      ) {

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

      if (
        action ===
        "cooking"
      ) {

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


        /*
        Клиенту
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

      if (
        action ===
        "courier"
      ) {

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

      if (
        action ===
        "delivered"
      ) {

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
