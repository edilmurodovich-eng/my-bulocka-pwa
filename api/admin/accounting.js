import crypto from "crypto";

const COOKIE_NAME = "bulocka_admin_session";

const PRICE_LIST = {
  1: 7000,
  2: 7000,
  3: 10000,
  4: 12000,
  5: 15000,
  6: 12000,
  7: 15000,
  8: 20000,
  9: 10000,
  10: 5000
};

const PRODUCT_NAMES = {
  1: "Sosiskali bulochka",
  2: "Vatrushka",
  3: "Makli bulochka",
  4: "Yong'oqli bulochka",
  5: "Shokoladli bulochka",
  6: "Jemli bulochka",
  7: "Hotdog",
  8: "Gamburger",
  9: "Kofe",
  10: "Choy"
};

export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {

    if (!isAdminAuthenticated(req)) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized"
      });
    }

    const redisUrl =
      process.env.KV_REST_API_URL;

    const redisToken =
      process.env.KV_REST_API_TOKEN;

    if (!redisUrl || !redisToken) {
      return res.status(500).json({
        ok: false,
        error: "Redis is not configured"
      });
    }

    const requestedDate =
      String(
        req.query.date ||
        today()
      );

    /*
    ==========================================
    ПОЛУЧАЕМ ЗАКАЗЫ
    ==========================================
    */

    const indexResult =
      await redisCommand(
        redisUrl,
        redisToken,
        [
          "LRANGE",
          "orders:index",
          "0",
          "4999"
        ]
      );

    const orderIds =
      Array.isArray(indexResult)
        ? indexResult
        : [];

    const orders = [];

    for (const orderId of orderIds) {

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
        continue;
      }

      try {

        const order =
          typeof result === "string"
            ? JSON.parse(result)
            : result;

        if (!order.createdAt) {
          continue;
        }

        const orderDate =
          new Date(
            order.createdAt
          )
            .toISOString()
            .slice(0, 10);

        if (
          orderDate ===
          requestedDate
        ) {
          orders.push(order);
        }

      } catch (error) {

        console.error(
          "INVALID ORDER:",
          orderId,
          error
        );

      }

    }


    /*
    ==========================================
    БУХГАЛТЕРИЯ
    ==========================================
    */

    let grossRevenue = 0;
    let discounts = 0;
    let netRevenue = 0;

    let deliveredRevenue = 0;
    let deliveredOrders = 0;

    let totalOrders = 0;
    let cancelledOrders = 0;

    const productStats = {};

    Object.keys(
      PRODUCT_NAMES
    ).forEach(id => {

      productStats[id] = {
        id: Number(id),
        name: PRODUCT_NAMES[id],
        price: PRICE_LIST[id],
        quantity: 0,
        revenue: 0
      };

    });


    /*
    ==========================================
    ОБРАБОТКА ЗАКАЗОВ
    ==========================================
    */

    orders.forEach(order => {

      totalOrders++;

      const status =
        order.status ||
        "new";

      if (
        status === "cancelled"
      ) {

        cancelledOrders++;

        return;

      }

      const total =
        Number(order.total) || 0;

      const discount =
        Number(order.discount) || 0;

      grossRevenue +=
        total + discount;

      discounts +=
        discount;

      netRevenue +=
        total;

      if (
        status === "delivered"
      ) {

        deliveredOrders++;

        deliveredRevenue +=
          total;

      }


      if (
        Array.isArray(
          order.items
        )
      ) {

        order.items.forEach(
          item => {

            const id =
              String(item.id);

            if (
              !productStats[id]
            ) {
              return;
            }

            const quantity =
              Number(
                item.quantity
              ) || 0;

            const price =
              PRICE_LIST[id] || 0;

            productStats[id]
              .quantity +=
              quantity;

            productStats[id]
              .revenue +=
              price *
              quantity;

          }
        );

      }

    });


    /*
    ==========================================
    ПОЛУЧАЕМ РАСХОДЫ
    ==========================================

    ВАЖНО:
    Это отдельный ключ.

    Старые заказы НЕ изменяются.
    ==========================================
    */

    const expenseResult =
      await redisCommand(
        redisUrl,
        redisToken,
        [
          "GET",
          `accounting:expenses:${requestedDate}`
        ]
      );

    let expenses = {
      otherExpenses: 0,
      salary: 0
    };

    if (expenseResult) {

      try {

        expenses =
          typeof expenseResult === "string"
            ? JSON.parse(expenseResult)
            : expenseResult;

      } catch {

        expenses = {
          otherExpenses: 0,
          salary: 0
        };

      }

    }


    const otherExpenses =
      Math.max(
        0,
        Number(
          expenses.otherExpenses
        ) || 0
      );

    const salary =
      Math.max(
        0,
        Number(
          expenses.salary
        ) || 0
      );


    /*
    ==========================================
    ЧИСТАЯ ПРИБЫЛЬ
    ==========================================
    */

    const totalExpenses =
      otherExpenses +
      salary;

    const netProfit =
      netRevenue -
      totalExpenses;


    /*
    ==========================================
    ТОВАРЫ
    ==========================================
    */

    const products =
      Object.values(
        productStats
      ).filter(
        item =>
          item.quantity > 0
      );


    /*
    ==========================================
    ОТВЕТ
    ==========================================
    */

    return res.status(200).json({

      ok: true,

      date:
        requestedDate,

      summary: {

        totalOrders,

        cancelledOrders,

        grossRevenue,

        discounts,

        netRevenue,

        deliveredOrders,

        deliveredRevenue,

        otherExpenses,

        salary,

        totalExpenses,

        netProfit

      },

      expenses: {

        otherExpenses,

        salary

      },

      products,

      orders:
        orders.map(
          order => ({

            orderId:
              order.orderId,

            name:
              order.name,

            phone:
              order.phone,

            total:
              Number(
                order.total
              ) || 0,

            discount:
              Number(
                order.discount
              ) || 0,

            status:
              order.status ||
              "new",

            createdAt:
              order.createdAt,

            items:
              order.items || []

          })
        )

    });

  } catch (error) {

    console.error(
      "ACCOUNTING ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "Accounting error"
    });

  }

}


/*
==========================================
ADMIN AUTH
==========================================
*/

function isAdminAuthenticated(req) {

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
      Buffer.from(signature);

    const b =
      Buffer.from(expected);

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

      if (index === -1) {
        return;
      }

      const key =
        part
          .slice(0, index)
          .trim();

      const value =
        part
          .slice(index + 1)
          .trim();

      result[key] =
        value;

    });

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
