'use strict';
function renderOrderSidebar(){
 const root=document.getElementById('desktopOrderItems');if(!root)return;const entries=Object.values(cart);
 root.innerHTML=entries.length?entries.map(line=>`<div class="sidebar-order-line"><strong>${Cloud.esc(lineName(line))}</strong><span>${line.qty} × ${priceText(line.item.price)}</span><b>${priceText(line.qty*line.item.price)}</b></div>`).join(''):'<div class="empty-order"><svg class="ui-icon" aria-hidden="true"><use href="icons.svg#clipboard"></use></svg><strong>No items yet</strong><p>Add dishes to your order.</p></div>';
 document.getElementById('desktopOrderTotal').textContent=priceText(cartTotal());document.getElementById('desktopOrderCheckout').hidden=!entries.length&&!pendingAttempt;document.getElementById('desktopOrderBill').hidden=!entries.length;
}
function syncNoteChips(){const parts=document.getElementById('custNotesInput').value.split(';').map(x=>x.trim().toLowerCase());document.querySelectorAll('[data-note-chip]').forEach(b=>b.setAttribute('aria-pressed',String(parts.includes(b.dataset.noteChip.toLowerCase()))));}
document.addEventListener('click',event=>{const b=event.target.closest('[data-note-chip]');if(!b)return;const input=document.getElementById('custNotesInput'),label=b.dataset.noteChip,parts=input.value.split(';').map(s=>s.trim()).filter(Boolean),at=parts.findIndex(p=>p.toLowerCase()===label.toLowerCase());if(at<0)parts.push(label);else parts.splice(at,1);const next=parts.join('; ');if(next.length>1000){message('Notes can contain at most 1000 characters.',true);return;}input.value=next;syncNoteChips();});
document.getElementById('custNotesInput').addEventListener('input',syncNoteChips);
