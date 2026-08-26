export function normalizePhoneNumber(input: unknown) {
  let value = String(input || '').trim().replace(/[\s().-]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (/^05\d{8}$/.test(value)) value = `+966${value.slice(1)}`;
  else if (/^5\d{8}$/.test(value)) value = `+966${value}`;
  else if (!value.startsWith('+') && /^\d{8,15}$/.test(value)) value = `+${value}`;
  if (!/^\+[1-9]\d{7,14}$/.test(value)) throw new Error('Enter a valid phone number with country code.');
  return value;
}

export async function sendWhatsAppVerification(phone: string, code: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return false;
  const version = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const message = templateName ? {
    messaging_product:'whatsapp', to:phone.replace(/^\+/, ''), type:'template',
    template:{ name:templateName, language:{ code:process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US' }, components:[{ type:'body', parameters:[{ type:'text', text:code }] }] },
  } : {
    messaging_product:'whatsapp', recipient_type:'individual', to:phone.replace(/^\+/, ''), type:'text',
    text:{ preview_url:false, body:`Your FleetFlow verification code is ${code}. It expires in 5 minutes.` },
  };
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error('WhatsApp Cloud API delivery failed', response.status, details.slice(0, 500));
    throw new Error(`WhatsApp could not send the verification code (${response.status}).`);
  }
  return true;
}
