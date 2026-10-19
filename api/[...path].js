const handlers = {
  "admin-network": () => import("../server/api-handlers/admin-network.js"),
  "admin-user-detail": () => import("../server/api-handlers/admin-user-detail.js"),
  "auth-sync": () => import("../server/api-handlers/auth-sync.js"),
  "member-profile": () => import("../server/api-handlers/member-profile.js"),
  "offer-poster": () => import("../server/api-handlers/offer-poster.js"),
  "p2p-transfer": () => import("../server/api-handlers/p2p-transfer.js"),
  "referral-lookup": () => import("../server/api-handlers/referral-lookup.js"),
  "session": () => import("../server/api-handlers/session.js"),
  "system-settings": () => import("../server/api-handlers/system-settings.js"),
  "transaction-otp": () => import("../server/api-handlers/transaction-otp.js"),
  "usdt-auto-credit-cron": () => import("../server/api-handlers/usdt-auto-credit-cron.js"),
  "usdt-bep20-deposit": () => import("../server/api-handlers/usdt-bep20-deposit.js"),
  "usdt-recharge": () => import("../server/api-handlers/usdt-recharge.js"),
  "withdrawal-request": () => import("../server/api-handlers/withdrawal-request.js"),
};

export default async function handler(req, res) {
  const rawPath = req.query?.path;
  const route = (Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath || ""))
    .split("/")
    .filter(Boolean)
    .join("/");
  const loadHandler = handlers[route];

  if (!loadHandler) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    return res.end(JSON.stringify({ error: "API route not found" }));
  }

  try {
    const module = await loadHandler();
    if (typeof module.default !== "function") {
      throw new Error("API handler export is missing");
    }
    return await module.default(req, res);
  } catch (error) {
    console.error("API dispatcher failed:", route, error instanceof Error ? error.message : error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      return res.end(JSON.stringify({ error: "Request could not be processed right now." }));
    }
    return res.end();
  }
}
