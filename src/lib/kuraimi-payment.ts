import { randomUUID } from 'node:crypto';

export type KuraimiGatewayConfig = {
  enabled:boolean; apiBaseUrl:string; merchantId:string; createPaymentPath:string;
};

export function kuraimiConfigured(config:KuraimiGatewayConfig) {
  return !!(config.enabled && config.apiBaseUrl && config.merchantId && process.env.KURAIMI_API_KEY);
}

export async function createKuraimiCheckout(config:KuraimiGatewayConfig,input:{
  reference:string; amount:number; currency:string; description:string; callbackUrl:string;
}) {
  const apiKey=process.env.KURAIMI_API_KEY;
  if(!kuraimiConfigured(config)||!apiKey)throw new Error('Kuraimi automatic payments are not configured yet. Add the API key to the secure server environment and enable the gateway.');
  const endpoint=new URL(config.createPaymentPath||'/payments',config.apiBaseUrl).toString();
  const response=await fetch(endpoint,{
    method:'POST',headers:{
      'Content-Type':'application/json','Accept':'application/json','Authorization':`Bearer ${apiKey}`,
      'X-API-Key':apiKey,'Idempotency-Key':input.reference,
    },
    body:JSON.stringify({
      merchantId:config.merchantId,merchant_id:config.merchantId,
      reference:input.reference,amount:input.amount,currency:input.currency,
      description:input.description,callbackUrl:input.callbackUrl,callback_url:input.callbackUrl,
    }),signal:AbortSignal.timeout(15_000),
  });
  const data:any=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(data.message||data.error||`Kuraimi payment request failed (${response.status}).`));
  const providerReference=String(data.reference||data.transactionId||data.transaction_id||data.id||randomUUID());
  const checkoutUrl=String(data.checkoutUrl||data.checkout_url||data.paymentUrl||data.payment_url||'');
  return {providerReference,checkoutUrl,status:checkoutUrl?'pending':'created',data};
}
