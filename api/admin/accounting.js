import crypto from "crypto";

const COOKIE_NAME =
  "bulocka_admin_session";

const PRICE_LIST = {
  1: 4000,
  2: 3500,
  3: 5000,
  4: 6000,
  5: 7000,
  6: 6000,
  7: 9000,
  8: 12000,
  9: 4000,
  10: 2000
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

      } catch {
        console.error(
          "INVALID ORDER:",
          orderId
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

    orders.forEach(order => {
      totalOrders++;

      const status =
        order.status ||
        "new";

      const isCancelled =
        status ===
        "cancelled";

      if (isCancelled) {
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
        status ===
        "delivered"
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

    const products =
      Object.values(
        productStats
      ).filter(
        item =>
          item.quantity > 0
      );

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
        deliveredRevenue
      },

      products,

      orders:
        orders.map(order => ({
          orderId:
            order.orderId,

          name:
            order.name,

          phone:
            order.phone,

          total:
            Number(order.total) || 0,

          discount:
            Number(order.discount) || 0,

          status:
            order.status || "new",

          createdAt:
            order.createdAt,

          items:
            order.items || []
        }))
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
