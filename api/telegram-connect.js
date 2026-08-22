export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const redisUrl = process.env.KV_REST_API_URL;
    const redisToken = process.env.KV_REST_API_TOKEN;

    if (!redisUrl || !redisToken) {
      return res.status(500).json({
        ok: false,
        error: "Redis is not configured"
      });
    }

    /*
    ==========================================
    СОЗДАЁМ УНИКАЛЬНЫЙ КОД
    ==========================================
    */

    const code =
      Math.random()
        .toString(36)
        .substring(2, 10)
        .toUpperCase();

    /*
    ==========================================
    СОХРАНЯЕМ КОД В REDIS
    ==========================================
    */

    const redisResponse = await fetch(
      redisUrl,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${redisToken}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify([
          "SET",
          `connect:${code}`,
          "waiting",
          "EX",
          "600"
        ])
      }
    );

    const redisData =
      await redisResponse.json();

    if (!redisResponse.ok) {
      console.error(
        "REDIS ERROR:",
        redisData
      );

      return res.status(500).json({
        ok: false,
        error: "Could not save connection code"
      });
    }

    /*
    ==========================================
    ССЫЛКА НА TELEGRAM
    ==========================================
    */

    const botUsername =
      "Thefirstbulochnaya_bot";

    const telegramUrl =
      `https://t.me/${botUsername}?start=${code}`;

    return res.status(200).json({
      ok: true,
      code,
      telegramUrl
    });

  } catch (error) {

    console.error(
      "TELEGRAM CONNECT ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
