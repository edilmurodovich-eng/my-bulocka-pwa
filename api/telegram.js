export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return res.status(500).json({
        ok: false,
        error: "TELEGRAM_BOT_TOKEN is not configured"
      });
    }

    const update = req.body;

    console.log(
      "TELEGRAM UPDATE:",
      JSON.stringify(update)
    );

    /*
    ==========================================
    CALLBACK — НАЖАТИЕ КНОПКИ
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

      const chatId =
        message.chat.id;

      const messageId =
        message.message_id;


      /*
      Убираем "часики"
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
      РАЗБИРАЕМ КНОПКУ
      ========================================

      status:accepted:MB-MT4QWF0E

      Получаем:

      status
      accepted
      MB-MT4QWF0E
      */

      const parts =
        callbackData.split(":");

      const action =
        parts[1];

      const orderId =
        parts.slice(2).join(":");


      console.log(
        "CALLBACK ACTION:",
        action
      );

      console.log(
        "ORDER ID:",
        orderId
      );


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


        /*
        Не добавляем статус повторно
        */

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


        /*
        Новые кнопки
        */

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


        /*
        Меняем сообщение
        */

        const result =
          await telegramRequest(
            token,
            "editMessageText",
            {
              chat_id:
                chatId,

              message_id:
                messageId,

              text:
                newText,

              reply_markup:
                keyboard
            }
          );


        console.log(
          "EDIT RESULT:",
          JSON.stringify(result)
        );


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


        let newText =
          oldText;


        if (
          !oldText.includes(
            "🍳 ЗАКАЗ ГОТОВИТСЯ"
          )
        ) {

          newText =
            oldText +
            "\n\n" +
            "🍳 ЗАКАЗ ГОТОВИТСЯ";

        }


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


        const result =
          await telegramRequest(
            token,
            "editMessageText",
            {
              chat_id:
                chatId,

              message_id:
                messageId,

              text:
                newText,

              reply_markup:
                keyboard
            }
          );


        console.log(
          "COOKING RESULT:",
          JSON.stringify(result)
        );


        return res.status(200).json({
          ok: true
        });

      }


      /*
      ========================================
      ПЕРЕДАН КУРЬЕРУ
      ========================================
      */

      if (
        action ===
        "courier"
      ) {

        const oldText =
          message.text || "";


        let newText =
          oldText;


        if (
          !oldText.includes(
            "🛵 ПЕРЕДАН КУРЬЕРУ"
          )
        ) {

          newText =
            oldText +
            "\n\n" +
            "🛵 ПЕРЕДАН КУРЬЕРУ";

        }


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


        const result =
          await telegramRequest(
            token,
            "editMessageText",
            {
              chat_id:
                chatId,

              message_id:
                messageId,

              text:
                newText,

              reply_markup:
                keyboard
            }
          );


        console.log(
          "COURIER RESULT:",
          JSON.stringify(result)
        );


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


        let newText =
          oldText;


        if (
          !oldText.includes(
            "✅ ЗАКАЗ ДОСТАВЛЕН"
          )
        ) {

          newText =
            oldText +
            "\n\n" +
            "✅ ЗАКАЗ ДОСТАВЛЕН";

        }


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


        const result =
          await telegramRequest(
            token,
            "editMessageText",
            {
              chat_id:
                chatId,

              message_id:
                messageId,

              text:
                newText,

              reply_markup:
                keyboard
            }
          );


        console.log(
          "DELIVERED RESULT:",
          JSON.stringify(result)
        );


        return res.status(200).json({
          ok: true
        });

      }

    }


    /*
    ==========================================
    START TELEGRAM
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

        await telegramRequest(
          token,
          "sendMessage",
          {
            chat_id:
              chatId,

            text:
              "✅ Telegram успешно подключён!\n\n" +
              "Теперь вы будете получать уведомления о новых заказах."
          }
        );

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
      error: error.message
    });

  }

}


/*
==========================================
TELEGRAM API
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
