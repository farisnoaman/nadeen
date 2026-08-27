import { formatMoney } from './currencies';
export { formatMoney };

export const money=(value:number|string=0, currency:string='USD', locale?:'en'|'ar')=>formatMoney(Number(value), currency, locale);
export const shortDate=(value:string|Date)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(value));
export const dateTime=(value:string|Date)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
