export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return res.status(500).json({
        ok: false,
        error: "TELEGRAM_BOT_TOKEN is missing"
      });
    }

    const host =
      req.headers.host;

    const protocol =
      req.headers["x-forwarded-proto"] || "https";

    const webhookUrl =
      `${protocol}://${host}/api/telegram`;

    const response = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: webhookUrl
        })
      }
    );

    const data = await response.json();

    if (!data.ok) {
      return res.status(500).json({
        ok: false,
        error: data.description || "Webhook error"
      });
    }

    return res.status(200).json({
      ok: true,
      webhookUrl,
      telegramUrl:
        "https://t.me/Thefirstbulochnaya_bot?start=connect"
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
