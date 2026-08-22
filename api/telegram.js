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
    ОБЫЧНОЕ СООБЩЕНИЕ / START
    ==========================================
    */

    if (update.message) {

      const message = update.message;

      const chatId = message.chat.id;

      const text = message.text || "";


      /*
      Пользователь нажал START
      */

      if (text.startsWith("/start")) {

        await sendTelegramMessage(
          token,
          chatId,
          "✅ Telegram успешно подключён!\n\n" +
          "Теперь вы будете получать уведомления о новых заказах."
        );

      }

    }


    /*
    ==========================================
    НАЖАТИЕ КНОПКИ
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

      const chatId =
        message.chat.id;

      const messageId =
        message.message_id;


      /*
      Отвечаем Telegram,
      чтобы убрать "часики" на кнопке
      */

      await fetch(
        `https://api.telegram.org/bot${token}/answerCallbackQuery`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            callback_query_id:
              callbackId
          })
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
        Меняем кнопку
        */

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: "✅ Заказ принят",
                callback_data:
                  "status:accepted_already"
              }
            ]
          ]
        };


        /*
        Меняем текст кнопки
        */

        await fetch(
          `https://api.telegram.org/bot${token}/editMessageReplyMarkup`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({

              chat_id:
                chatId,

              message_id:
                messageId,

              reply_markup:
                keyboard

            })
          }
        );


        /*
        Добавляем сообщение
        */

        await sendTelegramMessage(
          token,
          chatId,
          "✅ Заказ принят!"
        );

      }

    }


    return res.status(200).json({
      ok: true
    });


  } catch (error) {

    console.error(
      "TELEGRAM WEBHOOK ERROR:",
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
ОТПРАВКА СООБЩЕНИЯ
==========================================
*/

async function sendTelegramMessage(
  token,
  chatId,
  text
) {

  const response =
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
            chatId,

          text

        })
      }
    );


  return response.json();

}
