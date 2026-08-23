export default async function handler(req, res) {
  if (
    req.method !== "POST" &&
    req.method !== "GET"
  ) {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  res.setHeader(
    "Set-Cookie",
    "bulocka_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
  );

  return res.status(200).json({
    ok: true
  });
}
