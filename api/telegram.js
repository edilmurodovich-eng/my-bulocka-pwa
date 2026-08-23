export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {

    const token =
      process.env.TELEGRAM_BOT_TOKEN;

    const ownerChatId =
      process.env.TELEGRAM_OWNER_CHAT_ID;

    const redisUrl =
      process.env.KV_REST_API_URL;

    const redisToken =
      process.env.KV_REST_API_TOKEN;


    /*
    ==========================================
    ПРОВЕРКА ENV
    ==========================================
    */

    if (!token) {
      return res.status(500).json({
        ok: false,
        error:
          "TELEGRAM_BOT_TOKEN is missing"
      });
    }


    if (!ownerChatId) {
      return res.status(500).json({
        ok: false,
        error:
          "TELEGRAM_OWNER_CHAT_ID is missing"
      });
    }


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
    ==========================================
    TELEGRAM UPDATE
    ==========================================
    */

    const update =
      req.body || {};


    console.log(
      "TELEGRAM UPDATE:",
      JSON.stringify(update)
    );


    /*
    ==========================================
    /start — ПОДКЛЮЧЕНИЕ TELEGRAM
    ==========================================
    */

    if (update.message) {

      const message =
        update.message;

      const chatId =
        message.chat?.id;

      const text =
        String(
          message.text || ""
        ).trim();


      if (
        text.startsWith("/start")
      ) {

        const parts =
          text.split(/\s+/);

        const code =
          parts[1]
            ? String(parts[1])
                .trim()
                .toUpperCase()
            : "";


        /*
        ======================================
        НЕТ КОДА
        ======================================
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
        ИЩЕМ КОД
        ======================================
        */

        const key =
          `connect:${code}`;


        const redisResult =
          await redisCommand(
            redisUrl,
            redisToken,
            [
              "GET",
              key
            ]
          );


        /*
        ======================================
        КОД НЕ НАЙДЕН
        ======================================
        */

        if (
          !redisResult ||
          redisResult !== "waiting"
        ) {

          await telegramRequest(
            token,
            "sendMessage",
            {
              chat_id:
                chatId,

              text:
                "❌ Код подключения не найден или уже использован.\n\n" +
                "Вернитесь в приложение «Моя Булочка» " +
                "и нажмите «Подключить Telegram», " +
                "чтобы получить новый код."
            }
          );


          return res.status(200).json({
            ok: true
          });

        }


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
            key,
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


        /*
        ======================================
        УСПЕШНО
        ======================================
        */

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
          ok: true,
          connected: true,
          code
        });

      }

    }


    /*
    ==========================================
    CALLBACK BUTTON
    ==========================================
    */

    if (update.callback_query) {

      return await handleCallback(
        update.callback_query,
        token,
        ownerChatId,
        redisUrl,
        redisToken,
        res
      );

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
        "Internal server error"
    });

  }

}


/*
==========================================
CALLBACK
==========================================
*/

async function handleCallback(
  callback,
  token,
  ownerChatId,
  redisUrl,
  redisToken,
  res
) {

  const callbackId =
    callback.id;

  const callbackData =
    callback.data || "";

  const message =
    callback.message;


  /*
  ==========================================
  ОТВЕЧАЕМ TELEGRAM
  ==========================================
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


  /*
  ==========================================
  ПРОВЕРКА ВЛАДЕЛЬЦА
  ==========================================
  */

  const callbackChatId =
    String(
      message.chat?.id || ""
    );

  const configuredOwnerChatId =
    String(ownerChatId);


  if (
    callbackChatId !==
    configuredOwnerChatId
  ) {

    console.error(
      "UNAUTHORIZED TELEGRAM CALLBACK:",
      callbackChatId
    );

    return res.status(200).json({
      ok: false,
      error:
        "Unauthorized"
    });

  }


  const messageId =
    message.message_id;


  /*
  ==========================================
  CALLBACK DATA
  ==========================================

  status:accepted:MB-XXXX
  status:cooking:MB-XXXX
  status:courier:MB-XXXX
  status:delivered:MB-XXXX
  status:cancelled:MB-XXXX

  ==========================================
  */

  const parts =
    callbackData.split(":");


  if (
    parts.length < 3 ||
    parts[0] !== "status"
  ) {

    return res.status(200).json({
      ok: true
    });

  }


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
  ==========================================
  ПОЛУЧАЕМ ЗАКАЗ
  ==========================================
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


  let order = null;


  if (orderResult) {

    try {

      order =
        typeof orderResult === "string"
          ? JSON.parse(orderResult)
          : orderResult;

    } catch (error) {

      console.error(
        "ORDER JSON ERROR:",
        error
      );

    }

  }


  if (!order) {

    return res.status(200).json({
      ok: false,
      error:
        "Order not found"
    });

  }


  /*
  ==========================================
  TELEGRAM КЛИЕНТА
  ==========================================
  */

  let customerChatId =
    null;


  const savedChat =
    await redisCommand(
      redisUrl,
      redisToken,
      [
        "GET",
        `order:${orderId}:chat`
      ]
    );


  if (savedChat) {

    customerChatId =
      String(savedChat);

  }


  if (
    !customerChatId &&
    order.telegramId
  ) {

    customerChatId =
      String(order.telegramId);

  }


  /*
  ==========================================
  ПРИНЯТ
  ==========================================
  */

  if (action === "accepted") {

    if (
      order.status === "cancelled" ||
      order.status === "delivered"
    ) {

      return res.status(200).json({
        ok: true
      });

    }


    await updateOrderStatus(
      redisUrl,
      redisToken,
      orderId,
      "accepted"
    );


    const oldText =
      message.text || "";


    const newText =
      oldText.includes(
        "✅ ЗАКАЗ ПРИНЯТ"
      )
        ? oldText
        : oldText +
          "\n\n✅ ЗАКАЗ ПРИНЯТ";


    /*
    КНОПКИ ПОСЛЕ ПРИНЯТИЯ
    */

    const keyboard = {

      inline_keyboard: [

        [
          {
            text:
              "🍳 Готовится",

            callback_data:
              `status:cooking:${orderId}`
          }
        ],

        [
          {
            text:
              "❌ Отменить заказ",

            callback_data:
              `status:cancelled:${orderId}`
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
    УВЕДОМЛЕНИЕ КЛИЕНТА
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
  ==========================================
  ГОТОВИТСЯ
  ==========================================
  */

  if (action === "cooking") {

    if (
      order.status === "cancelled" ||
      order.status === "delivered"
    ) {

      return res.status(200).json({
        ok: true
      });

    }


    await updateOrderStatus(
      redisUrl,
      redisToken,
      orderId,
      "cooking"
    );


    const oldText =
      message.text || "";


    const newText =
      oldText.includes(
        "🍳 ЗАКАЗ ГОТОВИТСЯ"
      )
        ? oldText
        : oldText +
          "\n\n🍳 ЗАКАЗ ГОТОВИТСЯ";


    const keyboard = {

      inline_keyboard: [

        [
          {
            text:
              "🛵 Передан курьеру",

            callback_data:
              `status:courier:${orderId}`
          }
        ],

        [
          {
            text:
              "❌ Отменить заказ",

            callback_data:
              `status:cancelled:${orderId}`
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
    УВЕДОМЛЕНИЕ КЛИЕНТА
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
  ==========================================
  КУРЬЕР
  ==========================================
  */

  if (action === "courier") {

    if (
      order.status === "cancelled" ||
      order.status === "delivered"
    ) {

      return res.status(200).json({
        ok: true
      });

    }


    await updateOrderStatus(
      redisUrl,
      redisToken,
      orderId,
      "courier"
    );


    const oldText =
      message.text || "";


    const newText =
      oldText.includes(
        "🛵 ПЕРЕДАН КУРЬЕРУ"
      )
        ? oldText
        : oldText +
          "\n\n🛵 ПЕРЕДАН КУРЬЕРУ";


    const keyboard = {

      inline_keyboard: [

        [
          {
            text:
              "✅ Доставлен",

            callback_data:
              `status:delivered:${orderId}`
          }
        ],

        [
          {
            text:
              "❌ Отменить заказ",

            callback_data:
              `status:cancelled:${orderId}`
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
    УВЕДОМЛЕНИЕ КЛИЕНТА
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
            "🛵 Заказ передан курьеру!"
        }
      );

    }


    return res.status(200).json({
      ok: true
    });

  }


  /*
  ==========================================
  ДОСТАВЛЕН
  ==========================================
  */

  if (action === "delivered") {

    if (
      order.status === "cancelled"
    ) {

      return res.status(200).json({
        ok: true
      });

    }


    await updateOrderStatus(
      redisUrl,
      redisToken,
      orderId,
      "delivered"
    );


    const oldText =
      message.text || "";


    const newText =
      oldText.includes(
        "✅ ЗАКАЗ ДОСТАВЛЕН"
      )
        ? oldText
        : oldText +
          "\n\n✅ ЗАКАЗ ДОСТАВЛЕН";


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

        reply_markup: {
          inline_keyboard: []
        }
      }
    );


    /*
    УВЕДОМЛЕНИЕ КЛИЕНТА
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
            "✅ Заказ доставлен!\n\n" +
            "Спасибо, что выбрали «Моя Булочка» ❤️"
        }
      );

    }


    return res.status(200).json({
      ok: true
    });

  }


  /*
  ==========================================
  ❌ ОТМЕНА ЗАКАЗА
  ==========================================
  */

  if (action === "cancelled") {

    /*
    Нельзя отменить:

    - уже доставленный;
    - уже отменённый заказ.
    */

    if (
      order.status === "delivered" ||
      order.status === "cancelled"
    ) {

      return res.status(200).json({
        ok: true
      });

    }


    /*
    ======================================
    ОБНОВЛЯЕМ СТАТУС
    ======================================
    */

    await updateOrderStatus(
      redisUrl,
      redisToken,
      orderId,
      "cancelled"
    );


    /*
    ======================================
    МЕНЯЕМ СООБЩЕНИЕ ВЛАДЕЛЬЦА
    ======================================
    */

    const oldText =
      message.text || "";


    const newText =
      oldText.includes(
        "❌ ЗАКАЗ ОТМЕНЁН"
      )
        ? oldText
        : oldText +
          "\n\n❌ ЗАКАЗ ОТМЕНЁН";


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

        reply_markup: {
          inline_keyboard: []
        }
      }
    );


    /*
    ======================================
    УВЕДОМЛЯЕМ КЛИЕНТА
    ======================================
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
            "❌ Ваш заказ отменён.\n\n" +
            "Если это произошло по ошибке, " +
            "пожалуйста, оформите новый заказ."
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

}


/*
==========================================
ОБНОВЛЕНИЕ СТАТУСА
==========================================
*/

async function updateOrderStatus(
  redisUrl,
  redisToken,
  orderId,
  status
) {

  /*
  ========================================
  ОТДЕЛЬНЫЙ STATUS KEY
  ========================================
  */

  await redisCommand(
    redisUrl,
    redisToken,
    [
      "SET",
      `order:${orderId}:status`,
      status,
      "EX",
      "7776000"
    ]
  );


  /*
  ========================================
  ОСНОВНОЙ ORDER
  ========================================
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


  if (!result) {
    return;
  }


  try {

    const order =
      typeof result === "string"
        ? JSON.parse(result)
        : result;


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
        "7776000"
      ]
    );


  } catch (error) {

    console.error(
      "ORDER STATUS UPDATE ERROR:",
      error
    );

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
