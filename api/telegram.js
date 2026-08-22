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
    КНОПКА TELEGRAM
    ==========================================
    */

    if (update.callback_query) {

      const callback =
        update.callback_query;

      const callbackId =
        callback.id;

      const callbackData =
        callback.data;

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
      Сразу убираем "часики"
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
      ПРИНЯТЬ ЗАКАЗ
      ========================================
      */

      if (
        callbackData ===
        "status:accepted"
      ) {

        /*
        Берём старый текст заказа
        */

        const oldText =
          message.text || "";


        /*
        Добавляем статус
        */

        const newText =
          oldText +
          "\n\n" +
          "✅ ЗАКАЗ ПРИНЯТ";


        /*
        Новая клавиатура
        */

        const keyboard = {
          inline_keyboard: [
            [
              {
                text:
                  "✅ Заказ принят",
                callback_data:
                  "status:accepted_already"
              }
            ],
            [
              {
                text:
                  "🍳 Готовится",
                callback_data:
                  "status:cooking"
              }
            ]
          ]
        };


        /*
        Меняем сообщение
        */

        const editResult =
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
          JSON.stringify(
            editResult
          )
        );


        return res.status(200).json({
          ok: true
        });
      }


      /*
      ========================================
      ЗАКАЗ УЖЕ ПРИНЯТ
      ========================================
      */

      if (
        callbackData ===
        "status:accepted_already"
      ) {

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
        callbackData ===
        "status:cooking"
      ) {

        const oldText =
          message.text || "";


        const newText =
          oldText +
          "\n\n" +
          "🍳 ЗАКАЗ ГОТОВИТСЯ";


        const keyboard = {
          inline_keyboard: [
            [
              {
                text:
                  "🍳 Готовится",
                callback_data:
                  "status:cooking_already"
              }
            ],
            [
              {
                text:
                  "🛵 Передан курьеру",
                callback_data:
                  "status:courier"
              }
            ]
          ]
        };


        const editResult =
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
          JSON.stringify(
            editResult
          )
        );


        return res.status(200).json({
          ok: true
        });

      }

    }


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
