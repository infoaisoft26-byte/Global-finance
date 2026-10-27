const handlers = {
  "admin-network": () => import("../server/api-handlers/admin-network.js"),
  "admin-p2p-report": () => import("../server/api-handlers/admin-p2p-report.js"),
  "admin-user-detail": () => import("../server/api-handlers/admin-user-detail.js"),
  "website-feedback": () => import("../server/api-handlers/website-feedback.js"),
  "website-survey": () => import("../server/api-handlers/website-survey.js"),
  "auth-sync": () => import("../server/api-handlers/auth-sync.js"),
  "internal-wallet-transfer": () => import("../server/api-handlers/internal-wallet-transfer.js"),
  "member-profile": () => import("../server/api-handlers/member-profile.js"),
  "member-income-history": () => import("../server/api-handlers/member-income-history.js"),
  "member-wallet": () => import("../server/api-handlers/member-wallet.js"),
  "offer-poster": () => import("../server/api-handlers/offer-poster.js"),
  "p2p-transfer": () => import("../server/api-handlers/p2p-transfer.js"),
  "referral-lookup": () => import("../server/api-handlers/referral-lookup.js"),
  "session": () => import("../server/api-handlers/session.js"),
  "system-settings": () => import("../server/api-handlers/system-settings.js"),
  "telegram-link-token": () => import("../server/api-handlers/telegram-link-token.js"),
  "transaction-otp": () => import("../server/api-handlers/transaction-otp.js"),
  "usdt-auto-credit-cron": () => import("../server/api-handlers/usdt-auto-credit-cron.js"),
  "usdt-bep20-deposit": () => import("../server/api-handlers/usdt-bep20-deposit.js"),
  "usdt-recharge": () => import("../server/api-handlers/usdt-recharge.js"),
  "withdrawal-request": () => import("../server/api-handlers/withdrawal-request.js"),
  "withdrawal-admin-review": () => import("../server/api-handlers/withdrawal-admin-review.js"),
};

export default async function handler(req, res) {
  // Vercel catch-all routes may expose the path through req.query.path, or
  // leave it empty when a direct /api/<route> request reaches this function.
  // Resolve both forms so valid handlers do not incorrectly return 404.
  const rawPath = req.query?.path;
  const fromQuery = Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath || "");
  const fromUrl = String(req.url || "").split("?")[0];
  const candidate = fromQuery || fromUrl;
  const route = candidate
    .split("/")
    .filter(Boolean)
    .filter((part) => part !== "api")
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
