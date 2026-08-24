import crypto from "crypto";

const COOKIE_NAME =
  "bulocka_admin_session";


export default async function handler(
  req,
  res
) {

  /*
  ========================================
  AUTH
  ========================================
  */

  if (!isAdminAuthenticated(req)) {

    return res.status(401).json({
      ok: false,
      error: "Unauthorized"
    });

  }


  /*
  ========================================
  ENV
  ========================================
  */

  const redisUrl =
    process.env.KV_REST_API_URL;

  const redisToken =
    process.env.KV_REST_API_TOKEN;


  if (!redisUrl || !redisToken) {

    return res.status(500).json({
      ok: false,
      error:
        "Redis is not configured"
    });

  }


  try {

    /*
    ======================================
    GET
    ======================================
    */

    if (req.method === "GET") {

      const date =
        normalizeDate(
          req.query.date
        );


      if (!date) {

        return res.status(400).json({
          ok: false,
          error:
            "Invalid date"
        });

      }


      const result =
        await redisCommand(
          redisUrl,
          redisToken,
          [
            "GET",
            `expenses:${date}`
          ]
        );


      let expenses = {
        date,
        otherExpenses: 0,
        salary: 0
      };


      if (result) {

        try {

          expenses =
            typeof result === "string"
              ? JSON.parse(result)
              : result;

        } catch {

          expenses = {
            date,
            otherExpenses: 0,
            salary: 0
          };

        }

      }


      return res.status(200).json({

        ok: true,

        date,

        otherExpenses:
          Number(
            expenses.otherExpenses
          ) || 0,

        salary:
          Number(
            expenses.salary
          ) || 0

      });

    }


    /*
    ======================================
    POST
    ======================================
    */

    if (req.method === "POST") {

      const body =
        req.body || {};


      const date =
        normalizeDate(
          body.date
        );


      if (!date) {

        return res.status(400).json({
          ok: false,
          error:
            "Invalid date"
        });

      }


      let otherExpenses =
        Number(
          body.otherExpenses
        );


      let salary =
        Number(
          body.salary
        );


      /*
      ------------------------------------
      ПРОВЕРКА ЧИСЕЛ
      ------------------------------------
      */

      if (
        !Number.isFinite(
          otherExpenses
        ) ||
        otherExpenses < 0
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "Invalid other expenses"
        });

      }


      if (
        !Number.isFinite(
          salary
        ) ||
        salary < 0
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "Invalid salary"
        });

      }


      /*
      ------------------------------------
      ОКРУГЛЕНИЕ
      ------------------------------------
      */

      otherExpenses =
        Math.round(
          otherExpenses
        );


      salary =
        Math.round(
          salary
        );


      /*
      ------------------------------------
      СОХРАНЕНИЕ
      ------------------------------------
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

          `expenses:${date}`,

          JSON.stringify(
            expenses
          ),

          "EX",

          "31536000"
        ]
      );


      /*
      ------------------------------------
      ОТВЕТ
      ------------------------------------
      */

      return res.status(200).json({

        ok: true,

        date,

        otherExpenses,

        salary

      });

    }


    /*
    ======================================
    METHOD NOT ALLOWED
    ======================================
    */

    return res.status(405).json({

      ok: false,

      error:
        "Method not allowed"

    });


  } catch (error) {

    console.error(
      "EXPENSES API ERROR:",
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
DATE
==========================================
*/

function normalizeDate(
  value
) {

  const date =
    String(
      value || ""
    ).trim();


  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(date)
  ) {

    return null;

  }


  const parsed =
    new Date(
      `${date}T00:00:00Z`
    );


  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {

    return null;

  }


  return date;

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
    process.env
      .ADMIN_SESSION_SECRET;


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
      Number(
        parts[1]
      );


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
    .forEach(
      part => {

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

      }
    );


  return result;

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

        method:
          "POST",

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
