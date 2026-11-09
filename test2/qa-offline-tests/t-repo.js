const base='/home/claude/src/WEBSITE/billing-suite/offline/';
global.LocalDB=require(base+'local-db.js');
const LocalRepo=require(base+'repo.js');
const runner=require('/home/claude/qa/off/sqlite-runner.js');
const R=[],ok=(n,c,x='')=>R.push((c?'PASS ':'FAIL ')+n+(x?' — '+String(x).slice(0,170):''));
const S={tax_enabled:true,tax_mode:'percent',tax_value:5,timezone:'Asia/Kolkata'};
const ID=n=>JSON.stringify([n,null]);
(async()=>{
 await LocalDB.open({runner:runner()});
 await LocalRepo.saveCatalogue([
   {id:ID('m1'),menu_id:'m1',name:'Veg Momos',category:'Momos',price:100,active:true,track_stock:true,stock:10,low_stock_at:3,unit:'pcs'},
   {id:ID('m2'),menu_id:'m2',name:'Cold Coffee',category:'Drinks',price:95,active:true,track_stock:false,stock:0,unit:'pcs'}],['Momos','Drinks']);
 const cat=await LocalRepo.catalogue();
 ok('catalogue cached locally',cat.items.length===2&&cat.categories.join()==='Momos,Drinks');
 await LocalRepo.metaSet('invoice_block',{prefix:'INV',digits:3,year:'2026-27',start:101,end:103,next:101,fallback:0});

 // ---- one bill, 2 momos, 10% off, cash 250
 const args={p_request_id:'11111111-1111-4111-8111-aaaaaaaa0001',p_items:[{id:ID('m1'),name:'Veg Momos',qty:2}],
   p_payment_method:'Cash',p_discount_mode:'percent',p_discount_value:10,p_cash_received:250,__settings:S};
 const t=LocalRepo.price(args,new Map(cat.items.map(i=>[i.id,i])));
 args.p_expected_total=t.total;
 const b=await LocalRepo.commitBill(args);
 ok('bill totals match the server rules',t.subtotal===200&&t.discount===20&&t.tax===9&&t.total===189,JSON.stringify(t));
 ok('invoice number came from the block',b.invoice_no==='INV101'&&b.invoice_provisional===false,b.invoice_no);
 ok('change worked out',b.change_amount===61,String(b.change_amount));
 ok('stock came down 10 -> 8',(await LocalDB.get('items',ID('m1'))).stock===8);
 ok('line items written',(await LocalDB.all('bill_items',{index:'bill_id',equals:b.id})).length===1);
 ok('stock movement written',(await LocalDB.all('stock_moves',{})).length===1);
 const out=await LocalRepo.pending();
 ok('one note queued for the server',out.length===1&&out[0].kind==='bill.create'&&out[0].payload.total===189,JSON.stringify(out[0]&&out[0].payload.total));

 // ---- pressing save twice must not make two bills
 const again=await LocalRepo.commitBill({...args});
 ok('same save twice = one bill',again.id===b.id&&(await LocalDB.count('bills'))===1);
 ok('and only one queued note',(await LocalRepo.pending()).length===1);

 // ---- a bill that does not match what the screen showed is refused, and nothing is written
 let threw='';
 try{ await LocalRepo.commitBill({...args,p_request_id:LocalRepo.uuid(),p_expected_total:5}); }catch(e){ threw=e.message; }
 ok('mismatched total refused',/adds up to/.test(threw),threw);
 ok('nothing half-written after the refusal',(await LocalDB.count('bills'))===1&&(await LocalRepo.pending()).length===1&&(await LocalDB.get('items',ID('m1'))).stock===8);

 // ---- the number block runs out while still offline
 const mk=async n=>{const a={...args,p_request_id:LocalRepo.uuid(),p_items:[{id:ID('m2'),name:'Cold Coffee',qty:1}],p_cash_received:null,p_discount_value:0};
   const p=LocalRepo.price(a,new Map((await LocalRepo.catalogue()).items.map(i=>[i.id,i]))); a.p_expected_total=p.total; return LocalRepo.commitBill(a);};
 const b2=await mk(), b3=await mk(), b4=await mk();
 ok('block used to the last number',b2.invoice_no==='INV102'&&b3.invoice_no==='INV103',b2.invoice_no+','+b3.invoice_no);
 ok('past the block it is clearly marked, never a repeat',b4.invoice_provisional===true&&/^INV-[0-9A-F]{4}-0001$/.test(b4.invoice_no),b4.invoice_no);
 const allNos=(await LocalDB.all('bills',{})).map(x=>x.invoice_no);
 ok('every invoice number on the device is unique',new Set(allNos).size===allNos.length,allNos.join(' '));

 // ---- untracked item does not move stock
 ok('untracked dish leaves stock alone',(await LocalDB.get('items',ID('m2'))).stock===0);

 // ---- stock by hand
 await LocalRepo.adjustStock({item_id:ID('m1'),mode:'in',qty:5,note:'delivery'});
 ok('stock top-up',(await LocalDB.get('items',ID('m1'))).stock===13&&(await LocalRepo.pending()).length===5,String((await LocalRepo.pending()).length));

 // ---- reading back
 const day=LocalRepo.dayIn();
 const list=await LocalRepo.bills({from:day,to:day});
 ok('records list from the device',list.total===4&&list.summary.bills===4&&list.summary.sales===488.25,JSON.stringify(list.summary));
 const d=await LocalRepo.dashboard({from:day,to:day});
 ok('dashboard worked out on the device',d.metrics.bills===4&&d.top_items.length===2&&d.metrics.sales===488.25,JSON.stringify(d.metrics.sales));
 ok('low stock uses each item’s own level',d.low_stock.length===0,JSON.stringify(d.low_stock));
 console.log(R.join('\n'));
 const bad=R.filter(x=>x.startsWith('FAIL')).length; console.log(bad?bad+' FAILED':'all '+R.length+' passed');
})().catch(e=>{console.log(R.join('\n'));console.error('CRASH',e.stack.split('\n').slice(0,3).join(' | '))});
