import crypto from "crypto";

const COOKIE_NAME =
  "bulocka_admin_session";


export default async function handler(
  req,
  res
) {

  /*
  ==========================================
  ПРОВЕРКА МЕТОДА
  ==========================================
  */

  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {

    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });

  }


  try {

    /*
    ========================================
    АВТОРИЗАЦИЯ
    ========================================
    */

    if (
      !isAdminAuthenticated(req)
    ) {

      return res.status(401).json({
        ok: false,
        error: "Unauthorized"
      });

    }


    /*
    ========================================
    REDIS
    ========================================
    */

    const redisUrl =
      process.env.KV_REST_API_URL;

    const redisToken =
      process.env.KV_REST_API_TOKEN;


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
    ========================================
    GET
    ========================================
    */

    if (
      req.method === "GET"
    ) {

      const date =
        String(
          req.query.date ||
          today()
        );


      const result =
        await redisCommand(
          redisUrl,
          redisToken,
          [
            "GET",
            `accounting:expenses:${date}`
          ]
        );


      let expenses = {

        date,

        otherExpenses: 0,

        salary: 0

      };


      if (result) {

        try {

          const saved =
            typeof result === "string"
              ? JSON.parse(result)
              : result;


          expenses = {

            date,

            otherExpenses:
              Math.max(
                0,
                Number(
                  saved.otherExpenses
                ) || 0
              ),

            salary:
              Math.max(
                0,
                Number(
                  saved.salary
                ) || 0
              )

          };

        } catch {

          // оставляем нули

        }

      }


      return res.status(200).json({

        ok: true,

        expenses

      });

    }


    /*
    ========================================
    POST
    ========================================
    */

    const body =
      req.body || {};


    const date =
      String(
        body.date ||
        today()
      );


    /*
    ========================================
    ПРОВЕРКА ДАТЫ
    ========================================
    */

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        date
      )
    ) {

      return res.status(400).json({
        ok: false,
        error: "Invalid date"
      });

    }


    /*
    ========================================
    СУММЫ
    ========================================
    */

    const otherExpenses =
      Math.max(
        0,
        Math.round(
          Number(
            body.otherExpenses
          ) || 0
        )
      );


    const salary =
      Math.max(
        0,
        Math.round(
          Number(
            body.salary
          ) || 0
        )
      );


    /*
    ========================================
    СОХРАНЯЕМ

    ВАЖНО:

    Мы НЕ изменяем:

    order:...
    orders:index

    Только:

    accounting:expenses:YYYY-MM-DD
    ========================================
    */

    const expenses = {

      date,

      otherExpenses,

      salary,

      updatedAt:
        new Date().toISOString()

    };


    await redisCommand(
      redisUrl,
      redisToken,
      [
        "SET",

        `accounting:expenses:${date}`,

        JSON.stringify(
          expenses
        ),

        "EX",

        "31536000"

      ]
    );


    /*
    ========================================
    ОТВЕТ
    ========================================
    */

    return res.status(200).json({

      ok: true,

      expenses

    });


  } catch (error) {

    console.error(
      "EXPENSES ERROR:",
      error
    );

    return res.status(500).json({

      ok: false,

      error:
        "Expenses error"

    });

  }

}


/*
==========================================
ADMIN AUTH
==========================================
*/

function isAdminAuthenticated(
  req
) {

  const secret =
    process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    return false;
  }


  const cookieHeader =
    req.headers.cookie || "";


  const cookies =
    parseCookies(
      cookieHeader
    );


  const session =
    cookies[
      COOKIE_NAME
    ];


  if (!session) {
    return false;
  }


  try {

    const decoded =
      Buffer
        .from(
          session,
          "base64url"
        )
        .toString();


    const parts =
      decoded.split(":");


    if (
      parts.length !== 3
    ) {
      return false;
    }


    const role =
      parts[0];

    const expiresAt =
      Number(parts[1]);

    const signature =
      parts[2];


    if (
      role !== "admin" ||
      !expiresAt ||
      Date.now() >
        expiresAt
    ) {

      return false;

    }


    const payload =
      `${role}:${expiresAt}`;


    const expected =
      crypto
        .createHmac(
          "sha256",
          secret
        )
        .update(payload)
        .digest("hex");


    const a =
      Buffer.from(
        signature
      );

    const b =
      Buffer.from(
        expected
      );


    if (
      a.length !==
      b.length
    ) {

      return false;

    }


    return crypto.timingSafeEqual(
      a,
      b
    );


  } catch {

    return false;

  }

}


/*
==========================================
COOKIES
==========================================
*/

function parseCookies(
  header
) {

  const result = {};


  header
    .split(";")
    .forEach(part => {

      const index =
        part.indexOf("=");


      if (
        index === -1
      ) {

        return;

      }


      const key =
        part
          .slice(
            0,
            index
          )
          .trim();


      const value =
        part
          .slice(
            index + 1
          )
          .trim();


      result[key] =
        value;

    });


  return result;

}


/*
==========================================
DATE
==========================================
*/

function today() {

  return new Date()
    .toISOString()
    .slice(0, 10);

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
          JSON.stringify(
            command
          )

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
