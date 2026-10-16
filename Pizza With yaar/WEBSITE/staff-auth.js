/* Shared manager/waiter password login. Passwords are never saved in browser storage. */
'use strict';
const StaffAuth=(()=>{
 let onReady=null,busy=false;
 const el=id=>document.getElementById(id);
 function note(text,error=false){el('loginStatus').textContent=text;el('loginStatus').style.color=error?'#fca5a5':'#94a3b8';}
 async function start(enter){
  onReady=enter;
  if(!Cloud.configured){el('staffSignInButton').disabled=true;note('Connection settings are missing. Ask the manager to update the shared config.js file.',true);return;}
  if(Cloud.hasSession()){try{await onReady();}catch(e){note(e.message,true);}}
 }
 async function signIn(){
  if(busy||!onReady)return;
  if(!el('staffLoginForm').reportValidity())return;
  const email=el('staffEmail').value.trim(),password=el('staffPassword').value;
  const button=el('staffSignInButton');busy=true;button.disabled=true;button.textContent='Signing in…';note('Signing in…');
  let authenticated=false;
  try{
   await Cloud.login(email,password);authenticated=true;el('staffPassword').value='';
   await onReady();note('');
  }catch(e){
   if(authenticated){try{await Cloud.logout();}catch{}}
   note('Sign-in failed: '+e.message,true);
  }finally{busy=false;button.disabled=false;button.textContent='Sign in';}
 }
 return {start,signIn};
})();
function signInStaff(){return StaffAuth.signIn();}
