/* Admins use native Supabase TOTP/AAL2. Managers remain password-only.
   Enrollment secrets are rendered only in memory/DOM, never browser storage. */
'use strict';
const StaffAuth=(()=>{
 let onReady=null,busy=false;
 const el=id=>document.getElementById(id);
 function note(text,error=false){el('loginStatus').textContent=text;el('loginStatus').style.color=error?'#fca5a5':'#94a3b8';}
 function clearSetup(){el('adminMfaQr').removeAttribute('src');el('adminMfaSecret').textContent='';el('adminMfaQrPanel').hidden=true;el('adminMfaCode').value='';}
 function factorOptions(factors){const select=el('adminMfaFactor');select.replaceChildren();for(const f of factors){const o=document.createElement('option');o.value=f.id;o.textContent=f.friendly_name||'Authenticator';select.append(o);}select.disabled=factors.length===1;}
 function showMfa(){el('staffLoginForm').hidden=true;el('adminMfaForm').hidden=false;}
 async function enter(){
  const status=await Cloud.rpc('restaurant_admin_auth_status',{},true);
  if(status.role==='admin'){
   // Older database versions must never silently admit an admin without native MFA.
   if(status.mfa_required!==true||status.verification_method!=='totp')throw Error('Release 15 database update is required. Ask the project owner to run UPDATE-15.sql.');
   if(!status.verified){
    showMfa();clearSetup();el('adminMfaVerifyPanel').hidden=true;el('adminMfaSetup').hidden=true;
    const factors=await Cloud.mfaFactors(),verified=factors.filter(f=>f.status==='verified');
    if(verified.length){factorOptions(verified);el('adminMfaVerifyPanel').hidden=false;el('adminMfaTitle').textContent='Admin authenticator verification';el('adminMfaHelp').textContent='Enter the current six-digit code from your authenticator app. No email is sent.';el('adminMfaCode').focus();}
    else{el('adminMfaTitle').textContent='Set up admin authenticator';el('adminMfaHelp').textContent='One-time setup: add this admin account to Google Authenticator or another compatible app, then verify a code.';el('adminMfaSetup').hidden=false;el('adminMfaEnroll').hidden=false;}
    return;
   }
  }
  clearSetup();el('adminMfaForm').hidden=true;await onReady();note('');
 }
 async function start(ready){onReady=ready;try{sessionStorage.removeItem('RESTAURANT_ADMIN_CHALLENGE_v1');}catch{}if(!Cloud.configured){el('staffSignInButton').disabled=true;note('Connection settings are missing.',true);return;}if(Cloud.hasSession()){busy=true;try{await enter();}catch(e){showMfa();note(e.message,true);}finally{busy=false;}}}
 async function signIn(){if(busy||!onReady||!el('staffLoginForm').reportValidity())return;busy=true;el('staffSignInButton').disabled=true;note('Signing in…');
  try{await Cloud.login(el('staffEmail').value.trim(),el('staffPassword').value);el('staffPassword').value='';note('');await enter();}catch(e){note('Sign-in could not complete: '+e.message,true);}finally{busy=false;el('staffSignInButton').disabled=false;}
 }
 async function enroll(){if(busy)return;busy=true;el('adminMfaEnroll').disabled=true;note('Preparing private setup QR…');
  try{
   // Supabase does not return an old unverified factor's secret. Clean up only
   // this app's unfinished TOTP enrollments, never a verified/other factor.
   const factors=await Cloud.mfaFactors();
   if(factors.some(f=>f.status==='verified')){await enter();return;}
   for(const f of factors)if(f.status==='unverified'&&String(f.friendly_name||'').startsWith('Pizza With Yaar admin '))await Cloud.mfaUnenrollPending(f.id);
   const factor=await Cloud.mfaEnroll(),totp=factor.totp;
   if(!factor.id||!totp?.secret||!totp?.qr_code)throw Error('Supabase did not return an enrollment QR. Check that TOTP enrollment is enabled.');
   const qr=totp.qr_code;
   if(qr.trim().startsWith('<svg'))el('adminMfaQr').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(qr);
   else if(/^data:image\/svg\+xml[;,]/i.test(qr))el('adminMfaQr').src=qr;
   else throw Error('Unexpected QR format. Contact the project owner.');
   el('adminMfaSecret').textContent=totp.secret;el('adminMfaQrPanel').hidden=false;el('adminMfaEnroll').hidden=true;
   factorOptions([factor]);el('adminMfaVerifyPanel').hidden=false;el('adminMfaCode').focus();note('Scan the setup QR, then enter the current code. Keep your authenticator backed up securely.');
  }catch(e){note(e.message,true);}finally{busy=false;el('adminMfaEnroll').disabled=false;}
 }
 async function verify(event){event.preventDefault();if(busy||!el('adminMfaForm').reportValidity())return;const factor=el('adminMfaFactor').value;if(!factor){note('Set up an authenticator first.',true);return;}busy=true;el('adminMfaVerify').disabled=true;
  try{await Cloud.mfaVerify(factor,el('adminMfaCode').value.trim());clearSetup();note('');await enter();}catch(e){el('adminMfaCode').value='';note('Verification could not complete: '+e.message+' If a code expired, wait for the next code. Check your phone uses automatic time.',true);}finally{busy=false;el('adminMfaVerify').disabled=false;}
 }
 async function retry(){if(busy)return;busy=true;try{note('');await enter();}catch(e){showMfa();note(e.message,true);}finally{busy=false;}}
 async function cancel(){if(busy)return;busy=true;try{clearSetup();await Cloud.logout().catch(()=>{});el('adminMfaForm').hidden=true;el('staffLoginForm').hidden=false;note('');}finally{busy=false;}}
 // Do not leave the enrollment QR/secret in a page restored from the back-forward cache.
 window.addEventListener('pagehide',clearSetup);
 return {start,signIn,enroll,verify,retry,cancel};
})();
function signInStaff(){return StaffAuth.signIn();}
