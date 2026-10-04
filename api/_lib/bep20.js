export function rechargeConfigured() {
  const paymentsEnabled =
    String(process.env.PAYMENTS_ENABLED || '').trim().toLowerCase() === 'true';

  const rechargeEnabled =
    String(process.env.USDT_RECHARGE_ENABLED || '').trim().toLowerCase() === 'true';

  const contract =
    String(process.env.USDT_BEP20_CONTRACT_ADDRESS || '').trim();

  const rpc =
    String(process.env.BSC_RPC_URL || '').trim();

  const contractValid =
    /^0x[0-9a-fA-F]{40}$/.test(contract);

  const rpcConfigured =
    /^https?:\/\//i.test(rpc);

  console.log('GLOBAL FINANCE PAYMENT CONFIG:', {
    paymentsEnabled,
    rechargeEnabled,
    contractValid,
    rpcConfigured,
  });

  return (
    paymentsEnabled &&
    rechargeEnabled &&
    contractValid &&
    rpcConfigured
  );
}
