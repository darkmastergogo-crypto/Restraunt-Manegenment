/* Password sign-in for staff. Admin email verification is enforced by the database. */
'use strict';
const StaffAuth=(()=>{
 let onReady=null,busy=false,pending=null;
 const el=id=>document.getElementById(id),storageKey='RESTAURANT_ADMIN_CHALLENGE_v1';
 function note(text,error=false){el('loginStatus').textContent=text;el('loginStatus').style.color=error?'#fca5a5':'#94a3b8';}
 function paintOtp(){el('staffLoginForm').hidden=true;el('adminOtpForm').hidden=false;el('adminOtpEmail').textContent=pending?.email_hint||'your admin email';el('adminOtpCode').value='';el('adminOtpCode').focus();}
 function remember(value){pending=value;try{if(value)sessionStorage.setItem(storageKey,JSON.stringify(value));else sessionStorage.removeItem(storageKey);}catch{}}
 async function send(){const data=await Cloud.adminOtp({action:'send'});remember(data);paintOtp();note('Code sent. It expires in 5 minutes.');}
 async function enter(){
  const status=await Cloud.rpc('restaurant_admin_auth_status',{},true);
  if(status.otp_required&&!status.verified){
   if(!pending){try{pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}}
   el('staffLoginForm').hidden=true;el('adminOtpForm').hidden=false;
   if(pending?.challenge_id){paintOtp();note('Enter the email code, or request a new one.');}else{paintOtp();await send();}
   return;
  }
  remember(null);await onReady();el('adminOtpForm').hidden=true;note('');
 }
 async function start(ready){onReady=ready;if(!Cloud.configured){el('staffSignInButton').disabled=true;note('Connection settings are missing.',true);return;}if(Cloud.hasSession()){try{await enter();}catch(e){note(e.message,true);}}}
 async function signIn(){if(busy||!onReady||!el('staffLoginForm').reportValidity())return;busy=true;const b=el('staffSignInButton');b.disabled=true;note('Signing in…');
  try{await Cloud.login(el('staffEmail').value.trim(),el('staffPassword').value);el('staffPassword').value='';remember(null);await enter();}catch(e){note('Sign-in could not complete: '+e.message,true);}finally{busy=false;b.disabled=false;}
 }
 async function verify(event){event.preventDefault();if(busy)return;if(!pending?.challenge_id){note('Request a new email code first.',true);return;}busy=true;el('adminOtpVerify').disabled=true;
  try{await Cloud.adminOtp({action:'verify',challenge_id:pending.challenge_id,code:el('adminOtpCode').value.trim()});remember(null);el('adminOtpCode').value='';await enter();}catch(e){el('adminOtpCode').value='';note(e.message,true);}finally{busy=false;el('adminOtpVerify').disabled=false;}
 }
 async function resend(){if(busy)return;busy=true;el('adminOtpResend').disabled=true;try{await send();}catch(e){note(e.message,true);}finally{busy=false;el('adminOtpResend').disabled=false;}}
 async function cancel(){if(busy)return;remember(null);await Cloud.logout().catch(()=>{});el('adminOtpCode').value='';el('adminOtpForm').hidden=true;el('staffLoginForm').hidden=false;note('');}
 return {start,signIn,verify,resend,cancel};
})();
function signInStaff(){return StaffAuth.signIn();}
