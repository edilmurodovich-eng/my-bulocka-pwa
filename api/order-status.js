export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {

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


    const orderId =
      String(
        req.query.orderId ||
        ""
      ).trim();


    if (!orderId) {
      return res.status(400).json({
        ok: false,
        error:
          "Order ID is required"
      });
    }


    const orderResult =
      await redisCommand(
        redisUrl,
        redisToken,
        [
          "GET",
          `order:${orderId}`
        ]
      );


    if (!orderResult) {
      return res.status(404).json({
        ok: false,
        error:
          "Order not found"
      });
    }


    let order;

    try {

      order =
        typeof orderResult ===
        "string"

          ? JSON.parse(
              orderResult
            )

          : orderResult;

    } catch {

      return res.status(500).json({
        ok: false,
        error:
          "Invalid order data"
      });

    }


    const statusResult =
      await redisCommand(
        redisUrl,
        redisToken,
        [
          "GET",
          `order:${orderId}:status`
        ]
      );


    const status =
      statusResult ||
      order.status ||
      "new";


    return res.status(200).json({

      ok: true,

      orderId:
        order.orderId ||
        orderId,

      status,

      createdAt:
        order.createdAt ||
        null,

      updatedAt:
        order.updatedAt ||
        null

    });


  } catch (error) {

    console.error(
      "ORDER STATUS ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "Internal server error"
    });

  }

}


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
    throw new Error(
      "Redis request failed"
    );
  }


  return data.result;
}
