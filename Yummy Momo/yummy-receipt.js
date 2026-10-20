/* Receipts are deliberately independent of the dashboard theme. */
'use strict';
const YummyReceipt={
 html(o){
  const e=Cloud.esc,m=v=>(Cloud.cfg.currency||'₹')+Number(v||0).toFixed(2);
  let items=o.items;if(typeof items==='string'){try{items=JSON.parse(items);}catch{items=[];}}
  if(!Array.isArray(items))items=[];
  const manual=o.order_source==='manual'||String(o.order_id||'').startsWith('MAN-');
  const tax=o.tax_enabled||Number(o.tax_amount)>0?`<div class="receipt-row"><span>Items subtotal</span><b>${m(o.items_subtotal)}</b></div><div class="receipt-row"><span>${o.tax_mode==='percent'?'Tax ('+Number(o.tax_value)+'%)':'Tax (fixed)'}</span><b>${m(o.tax_amount)}</b></div>`:'';
  return `<div class="receipt yummy-receipt"><h2>Yummy Momo</h2><p class="receipt-tagline">Yummy in your tummy</p><p>${e(Cloud.orderLabel(o))}</p><p>${e(new Date(o.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}))}</p><p>${o.table_number==='Counter'?'Counter / takeaway':'Table '+e(o.table_number)}</p><p>${manual?'Done':e(o.status)}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>${items.length?items.map(i=>`<tr><td>${e(i.name||i.base_name||'Dish')}</td><td>${e(i.qty??i.quantity??0)}</td><td>${m(i.price??i.unit_price)}</td><td>${m(i.subtotal??Number(i.qty??i.quantity)*Number(i.price??i.unit_price))}</td></tr>`).join(''):'<tr><td colspan="4">Item details unavailable. Please refresh order records.</td></tr>'}</tbody></table><div class="receipt-line"></div>${tax}<div class="receipt-row receipt-total"><b>Total</b><b>${m(o.total)}</b></div><p>Thank you for visiting!</p></div>`;
 }
};
