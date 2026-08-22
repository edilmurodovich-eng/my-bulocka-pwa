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

    const body = req.body;

    // Telegram прислал нажатие кнопки
    if (body?.callback_query) {
      const callback = body.callback_query;

      const callbackId = callback.id;
      const chatId = callback.message?.chat?.id;
      const messageId = callback.message?.message_id;
      const data = callback.data;

      let status = "";
      let nextButton = null;

      if (data === "status:accepted") {
        status = "🟢 Статус: Принят";

        nextButton = {
          inline_keyboard: [
            [
              {
                text: "👨‍🍳 Готовится",
                callback_data: "status:preparing"
              }
            ]
          ]
        };
      }

      else if (data === "status:preparing") {
        status = "🟡 Статус: Готовится";

        nextButton = {
          inline_keyboard: [
            [
              {
                text: "📦 Готов",
                callback_data: "status:ready"
              }
            ]
          ]
        };
      }

      else if (data === "status:ready") {
        status = "🔵 Статус: Готов";

        nextButton = {
          inline_keyboard: [
            [
              {
                text: "🚚 Доставлен",
                callback_data: "status:delivered"
              }
            ]
          ]
        };
      }

      else if (data === "status:delivered") {
        status = "🟣 Статус: Доставлен";

        nextButton = {
          inline_keyboard: []
        };
      }

      else {
        return res.status(200).json({
          ok: true
        });
      }

      // Убираем "часики" после нажатия кнопки
      await fetch(
        `https://api.telegram.org/bot${token}/answerCallbackQuery`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            callback_query_id: callbackId
          })
        }
      );

      // Меняем текст статуса и кнопку
      if (chatId && messageId) {
        const telegramResponse = await fetch(
          `https://api.telegram.org/bot${token}/editMessageReplyMarkup`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              reply_markup: nextButton
            })
          }
        );

        const telegramData =
          await telegramResponse.json();

        if (!telegramData.ok) {
          console.error(
            "Telegram edit error:",
            telegramData
          );
        }

        // Добавляем новый статус отдельным сообщением
        await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: status
            })
          }
        );
      }

      return res.status(200).json({
        ok: true
      });
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
