export default async function handler(req, res) {
  if (req.method !== "GET") {
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
        error: "Telegram bot token is not configured"
      });
    }

    const botUsername = "Thefirstbulochnaya_bot";

    const telegramUrl =
      `https://t.me/${botUsername}?start=connect`;

    return res.status(200).json({
      ok: true,
      telegramUrl
    });

  } catch (error) {
    console.error("TELEGRAM CONNECT ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
