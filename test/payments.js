/* Direct UPI only. Opening an app or scanning a QR never confirms payment. */
'use strict';
const OrderPayments = (() => {
 const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const payable = o => !!o && !o.tracking_unavailable && ['Accepted','Cooking','Ready','Served'].includes(o.status) && Number.isFinite(Number(o.total)) && Number(o.total)>0;
 function settings() {
  const c=RESTAURANT_CONFIG, id=String(c.upiId||'').trim(), name=String(c.upiPayeeName||'').trim();
  return c.upiEnabled===true && !/YOUR_|PASTE_/i.test(id+name) && /^[a-z0-9._-]{2,256}@[a-z0-9.-]{2,64}$/i.test(id) && name.length>0 && name.length<=100 ? {id,name} : null;
 }
 function uri(o) {
  const s=settings(); if(!s || !payable(o) || o.payment_status==='Paid')return null;
  const params = new URLSearchParams({pa:s.id,pn:s.name,am:Number(o.total).toFixed(2),cu:'INR',tr:String(o.id),tn:'Order '+String(o.daily_number||o.order_id||o.id)});
  return 'upi://pay?'+params.toString();
 }
 function customerHtml(o) {
  if(!o || o.tracking_unavailable)return '';
  if(o.payment_status==='Paid')return '<section class="order-payment"><strong class="payment-paid">Payment confirmed · Paid</strong></section>';
  if(!payable(o))return '';
  const link=uri(o); if(!link)return '<section class="order-payment"><p>UPI payment is not configured yet.</p></section>';
  let qr='';try{const code=qrcode(0,'M');code.addData(link);code.make();qr=code.createSvgTag({cellSize:4,margin:16,scalable:true});}catch{return '<section class="order-payment"><p>Payment code unavailable. Please try again.</p></section>';}
  const amount='₹'+Number(o.total).toFixed(2), s=settings();
  return `<section class="order-payment" aria-label="Pay this order"><h3>Pay for this order</h3><p><strong>${esc(amount)}</strong> · ${esc(s.name)}</p><a class="upi-pay-button" href="${esc(link)}">Pay ${esc(amount)} via UPI</a><details class="upi-qr"><summary>Show payment QR</summary><div class="upi-qr-image">${qr}</div><p>${esc(s.id)}</p></details><p class="upi-help">Opens a compatible UPI app on supported phones. You can also scan the QR using another device.</p></section>`;
 }
 function staffHtml(o) {
  if(o.payment_status==='Paid')return `<span class="payment-badge payment-paid" title="${esc(o.payment_confirmed_at?'Confirmed '+new Date(o.payment_confirmed_at).toLocaleString():'Payment confirmed')}">Paid</span>`;
  return `<span class="payment-badge">Unpaid</span>`+(payable(o)?`<button type="button" class="secondary-btn" data-confirm-payment="${esc(o.id)}">Confirm payment received</button>`:'');
 }
 return {uri,customerHtml,staffHtml,payable};
})();
