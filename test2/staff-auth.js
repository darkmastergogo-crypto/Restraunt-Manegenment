/* Staff sign-in — password only. */
'use strict';
const StaffAuth=(()=>{
 let onReady=null,busy=false;
 const el=id=>document.getElementById(id);
 function note(text,error=false){el('loginStatus').textContent=text;el('loginStatus').style.color=error?'#fca5a5':'#71717a';}
 async function enter(){await onReady();note('');}
 async function start(ready){onReady=ready;if(!Cloud.configured){el('staffSignInButton').disabled=true;note('Connection settings are missing.',true);return;}if(Cloud.hasSession()){busy=true;try{await enter();}catch(e){note(e.message,true);}finally{busy=false;}}}
 async function signIn(){if(busy||!onReady||!el('staffLoginForm').reportValidity())return;busy=true;el('staffSignInButton').disabled=true;note('Signing in…');
  try{await Cloud.login(el('staffEmail').value.trim(),el('staffPassword').value);el('staffPassword').value='';await enter();}catch(e){note('Sign-in could not complete: '+e.message,true);}finally{busy=false;el('staffSignInButton').disabled=false;}
 }
 return {start,signIn};
})();
function signInStaff(){return StaffAuth.signIn();}
