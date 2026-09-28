// The earlier self-service endpoint credited a USD token amount directly into an INR
// fund wallet. Recharge now requires a reviewed INR conversion and admin approval.
export default function handler(_req, res) {
  res.statusCode = 410;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: 'Use the reviewed /api/usdt-recharge flow' }));
}
