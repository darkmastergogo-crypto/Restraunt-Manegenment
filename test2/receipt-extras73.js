/* Release 73 — billing-grade receipt extras on top of the restaurant bill engine.
   Settings live in the existing Custom48 bill JSON. Per-bill custom-field values are
   persisted by restaurant_manual_order73 so reprints stay complete. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id), esc=v=>Cloud.esc(String(v??''));
 let qr='',sig='',built=false,busy=false;
 const canManage=()=>typeof staffRole!=='undefined'&&staffRole==='admin';
 const dataUrl=file=>new Promise((res,rej)=>{const r=new FileReader();r.onerror=()=>rej(Error('Could not read that image.'));r.onload=()=>res(String(r.result||''));r.readAsDataURL(file);});
 async function upload(file,kind){
  if(!file)return '';if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('Choose a PNG, JPG or WebP image.');
  if(file.size>1_500_000)throw Error('Choose an image under 1.5 MB.');
  const raw=await dataUrl(file);return Cloud.safeImage(await Cloud.uploadMenuImage(raw));
 }
 function panel(){
  let p=$('receiptExtras73Panel');if(p)return p;
  p=document.createElement('section');p.id='receiptExtras73Panel';p.className='panel receipt73-settings';p.hidden=true;
  p.innerHTML=`<div class="page-tools"><div><h3>Bill extras & payment presentation</h3><p class="hint">Dynamic UPI QR, bank transfer details, signature and custom fields for counter bills.</p></div><span class="badge73">Admin</span></div>
   <form id="receiptExtras73Form" class="receipt73-form">
    <fieldset><legend>Payment QR</legend><div class="receipt73-grid">
      <label class="waiter-permission"><input name="paymentQrEnabled" type="checkbox"> Show payment QR on bills</label>
      <label class="waiter-permission"><input name="paymentQrOnlyOnline" type="checkbox"> Only on UPI / online bills</label>
      <label>QR mode<select name="paymentQrMode"><option value="image">Uploaded QR image</option><option value="upi">Generate from UPI ID + bill amount</option></select></label>
      <label>Position<select name="paymentQrPosition"><option value="bottom">Bottom</option><option value="top">Top</option></select></label>
      <label data-upi73>UPI ID<input name="upiId" maxlength="80" placeholder="restaurant@okaxis"></label>
      <label data-upi73>Payee name<input name="upiPayee" maxlength="80" placeholder="Restaurant name"></label>
      <label>Caption<input name="paymentQrCaption" maxlength="80" placeholder="Scan to pay"></label>
      <div data-image73><label>Uploaded QR image<input id="receipt73QrFile" type="file" accept="image/png,image/jpeg,image/webp"></label><div id="receipt73QrPreview" class="receipt73-preview"></div><button class="secondary-btn" type="button" data-clear-qr>Remove image</button></div>
    </div></fieldset>
    <fieldset><legend>Bank transfer details</legend><div class="receipt73-grid">
      <label class="waiter-permission"><input name="bankEnabled" type="checkbox"> Print bank details</label>
      <label>Account holder<input name="bankHolder" maxlength="80"></label><label>Bank name<input name="bankName" maxlength="80"></label>
      <label>Account number<input name="bankAccount" maxlength="40" inputmode="numeric"></label><label>IFSC<input name="bankIfsc" maxlength="20"></label>
      <label class="receipt73-wide">Branch<input name="bankBranch" maxlength="100"></label>
    </div></fieldset>
    <fieldset><legend>Authorised signature</legend><div class="receipt73-grid">
      <label class="waiter-permission"><input name="signatureEnabled" type="checkbox"> Print signature</label>
      <label>Caption<input name="signatureLabel" maxlength="60" placeholder="Authorised signatory"></label>
      <label>Size<select name="signatureSize"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
      <div><label>Signature image<input id="receipt73SigFile" type="file" accept="image/png,image/jpeg,image/webp"></label><div id="receipt73SigPreview" class="receipt73-preview signature"></div><button class="secondary-btn" type="button" data-clear-sig>Remove image</button></div>
    </div></fieldset>
    <fieldset><legend>Custom fields on each counter bill</legend><p class="hint">One field name per line, maximum 10. Example: Delivery note, Vehicle no., Buyer order no.</p><textarea name="customFields" rows="5" maxlength="420" placeholder="Delivery note\nVehicle no.\nDestination"></textarea></fieldset>
    <div class="toolbar"><button class="primary-btn" type="submit">Save bill extras</button><button class="secondary-btn" type="button" data-reload>Reload</button></div><p id="receiptExtras73Status" class="hint" role="status"></p>
   </form>`;
  const management=$('managementSection');management?.append(p);built=true;
  p.querySelector('[data-reload]').onclick=load;
  p.querySelector('[data-clear-qr]').onclick=()=>{qr='';paintPreview();};p.querySelector('[data-clear-sig]').onclick=()=>{sig='';paintPreview();};
  p.querySelector('[name=paymentQrMode]').onchange=paintMode;
  p.querySelector('#receipt73QrFile').onchange=async e=>{try{status('Uploading QR…');qr=await upload(e.target.files?.[0],'qr');paintPreview();status('QR uploaded. Save bill extras to publish it.');}catch(x){status(x.message);}finally{e.target.value='';}};
  p.querySelector('#receipt73SigFile').onchange=async e=>{try{status('Uploading signature…');sig=await upload(e.target.files?.[0],'signature');paintPreview();status('Signature uploaded. Save bill extras to publish it.');}catch(x){status(x.message);}finally{e.target.value='';}};
  p.querySelector('form').onsubmit=save;
  return p;
 }
 function status(t){const n=$('receiptExtras73Status');if(n)n.textContent=t;}
 function paintPreview(){
  const qp=$('receipt73QrPreview'),sp=$('receipt73SigPreview');
  if(qp)qp.innerHTML=qr?`<img src="${esc(qr)}" alt="Payment QR">`:'<span>No uploaded QR</span>';
  if(sp)sp.innerHTML=sig?`<img src="${esc(sig)}" alt="Signature">`:'<span>No signature</span>';
 }
 function paintMode(){const f=$('receiptExtras73Form');if(!f)return;const upi=f.elements.paymentQrMode.value==='upi';for(const n of f.querySelectorAll('[data-upi73]'))n.hidden=!upi;for(const n of f.querySelectorAll('[data-image73]'))n.hidden=upi;}
 async function load(){
  const p=panel();if(!canManage()){p.hidden=true;return;}p.hidden=false;status('Loading…');
  try{await Custom48.sync(true);const b=Custom48.get()?.bill||{},f=$('receiptExtras73Form');
   qr=Cloud.safeImage(b.paymentQr||'');sig=Cloud.safeImage(b.signatureImage||'');
   const vals={paymentQrMode:b.paymentQrMode||'image',paymentQrPosition:b.paymentQrPosition||'bottom',upiId:b.upiId||'',upiPayee:b.upiPayee||'',paymentQrCaption:b.paymentQrCaption||'Scan to pay',bankHolder:b.bankHolder||'',bankName:b.bankName||'',bankAccount:b.bankAccount||'',bankIfsc:b.bankIfsc||'',bankBranch:b.bankBranch||'',signatureLabel:b.signatureLabel||'Authorised signatory',signatureSize:b.signatureSize||'medium',customFields:Array.isArray(b.customFieldLabels)?b.customFieldLabels.join('\n'):''};
   for(const [k,v] of Object.entries(vals))if(f.elements[k])f.elements[k].value=v;
   for(const k of ['paymentQrEnabled','paymentQrOnlyOnline','bankEnabled','signatureEnabled'])f.elements[k].checked=k==='paymentQrEnabled'?b[k]!==false:k==='paymentQrOnlyOnline'?b[k]!==false:!!b[k];
   paintPreview();paintMode();status('These settings apply to new prints and reprints.');
  }catch(e){status(e.message);}
 }
 async function save(e){
  e.preventDefault();if(busy||!canManage())return;busy=true;const f=e.currentTarget,btn=e.submitter;btn.disabled=true;status('Saving bill extras…');
  try{
   const labels=String(f.elements.customFields.value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,10);if(labels.some(x=>x.length>40))throw Error('Keep each custom field name under 40 characters.');
   const upi=String(f.elements.upiId.value||'').trim();if(f.elements.paymentQrMode.value==='upi'&&f.elements.paymentQrEnabled.checked&&!/^[^\s@]{1,64}@[A-Za-z0-9._-]{2,64}$/.test(upi))throw Error('Enter a valid UPI ID, for example restaurant@okaxis.');
   await Custom48.patchBill({paymentQr:qr,paymentQrMode:f.elements.paymentQrMode.value,paymentQrPosition:f.elements.paymentQrPosition.value,paymentQrEnabled:f.elements.paymentQrEnabled.checked,paymentQrOnlyOnline:f.elements.paymentQrOnlyOnline.checked,paymentQrCaption:f.elements.paymentQrCaption.value.trim().slice(0,80)||'Scan to pay',upiId:upi,upiPayee:f.elements.upiPayee.value.trim().slice(0,80),bankEnabled:f.elements.bankEnabled.checked,bankHolder:f.elements.bankHolder.value.trim(),bankName:f.elements.bankName.value.trim(),bankAccount:f.elements.bankAccount.value.trim(),bankIfsc:f.elements.bankIfsc.value.trim().toUpperCase(),bankBranch:f.elements.bankBranch.value.trim(),signatureEnabled:f.elements.signatureEnabled.checked,signatureImage:sig,signatureLabel:f.elements.signatureLabel.value.trim()||'Authorised signatory',signatureSize:f.elements.signatureSize.value,customFieldLabels:labels});
   status('Saved. POS fields and printed bills now use this setup.');
  }catch(x){status('Not saved: '+x.message);}finally{busy=false;btn.disabled=false;}
 }
 function init(){panel();const old=$('paymentQrPanel');if(old)old.hidden=true;let n=0,t=setInterval(()=>{n++;if(canManage()||n>80){clearInterval(t);load();}},350);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 window.ReceiptExtras73={load};
})();
