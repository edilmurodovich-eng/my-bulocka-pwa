import crypto from "crypto";

const COOKIE_NAME =
  "bulocka_admin_session";

const SESSION_HOURS = 8;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const password =
      process.env.ADMIN_PASSWORD;

    const secret =
      process.env.ADMIN_SESSION_SECRET;

    if (!password || !secret) {
      return res.status(500).json({
        ok: false,
        error:
          "Admin settings are not configured"
      });
    }

    const body =
      req.body || {};

    const enteredPassword =
      String(
        body.password || ""
      );

    const passwordBuffer =
      Buffer.from(password);

    const enteredBuffer =
      Buffer.from(
        enteredPassword
      );

    if (
      passwordBuffer.length !==
      enteredBuffer.length
    ) {
      return res.status(401).json({
        ok: false,
        error: "Неверный пароль"
      });
    }

    const passwordCorrect =
      crypto.timingSafeEqual(
        passwordBuffer,
        enteredBuffer
      );

    if (!passwordCorrect) {
      return res.status(401).json({
        ok: false,
        error: "Неверный пароль"
      });
    }

    const expiresAt =
      Date.now() +
      SESSION_HOURS *
      60 *
      60 *
      1000;

    const payload =
      `admin:${expiresAt}`;

    const signature =
      crypto
        .createHmac(
          "sha256",
          secret
        )
        .update(payload)
        .digest("hex");

    const session =
      Buffer
        .from(
          `${payload}:${signature}`
        )
        .toString("base64url");

    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 60 * 60}`
    );

    return res.status(200).json({
      ok: true,
      expiresAt
    });

  } catch (error) {
    console.error(
      "ADMIN LOGIN ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "Login error"
    });
  }
}
