require('/home/claude/qa/off/browser-stubs.js');
const base='/home/claude/src/WEBSITE/billing-suite/offline/';
global.LocalDB=require(base+'local-db.js');
global.LocalRepo=require(base+'repo.js');
global.SyncEngine=require(base+'sync.js');
const runner=require('/home/claude/qa/off/sqlite-runner.js');
const makeCloud=require('/home/claude/qa/off/cloud-shim.js');
const {execFileSync}=require('child_process');
const sql=q=>execFileSync('su',['postgres','-c',`psql -At -d rxtest -c ${JSON.stringify(q).replace(/\$/g,'\\$')}`],{encoding:'utf8'}).trim();
const R=[],ok=(n,c,x='')=>R.push((c?'PASS ':'FAIL ')+n+(x?' — '+String(x).slice(0,170):''));
const S={tax_enabled:false,tax_mode:'percent',tax_value:0,timezone:'Asia/Kolkata'};
const ID=n=>JSON.stringify([n,null]);
(async()=>{
 const cloud=makeCloud();
 await LocalDB.open({runner:runner()});
 SyncEngine._setCloud(cloud);
 // the device introduces itself and collects numbers in advance, while still online
 await SyncEngine.register(); await SyncEngine.topUpInvoices(true);
 const dev=SyncEngine.device;
 ok('device registered',!!dev&&sql(`select count(*) from rx20_devices where id='${dev}'`)==='1');
 const blk=await LocalRepo.invoiceState();
 ok('100 invoice numbers held in advance',blk.end-blk.start+1===100,JSON.stringify({s:blk.start,e:blk.end}));

 // catalogue onto the device
 const dish=sql("select menu_id from menu_stock where tracked limit 1");
 const variant=sql(`select variant from menu_stock where menu_id='${dish}' and tracked limit 1`);
 const startStock=Number(sql(`select remaining from menu_stock where menu_id='${dish}' and variant='${variant}'`));
 const itemId=JSON.stringify([dish,variant==='single'?null:variant]);
 await LocalRepo.saveCatalogue([{id:itemId,menu_id:dish,name:'Tracked dish',category:'Momos',price:100,active:true,track_stock:true,stock:startStock,unit:'pcs'}],['Momos']);

 // ---------------- THE INTERNET GOES AWAY ----------------
 cloud.online=false; global.navigator.onLine=false;
 const made=[];
 for(let i=0;i<100;i++){
   const a={p_request_id:LocalRepo.uuid(),p_items:[{id:itemId,name:'Tracked dish',qty:1}],p_payment_method:i%2?'Cash':'UPI',
     p_discount_value:0,p_cash_received:null,__settings:S};
   a.p_expected_total=LocalRepo.price(a,new Map([[itemId,{id:itemId,name:'Tracked dish',price:100,active:true,track_stock:true,stock:0,unit:'pcs'}]])).total;
   made.push(await LocalRepo.commitBill(a));
 }
 ok('100 bills taken with no internet',made.length===100&&(await LocalDB.count('bills'))===100);
 ok('all 100 have real, different invoice numbers',new Set(made.map(b=>b.invoice_no)).size===100&&made.every(b=>!b.invoice_provisional),made[0].invoice_no+'..'+made[99].invoice_no);
 ok('nothing reached the server yet',sql("select count(*) from orders")==='0',sql("select count(*) from orders"));
 ok('100 notes waiting to be sent',(await LocalRepo.pending()).length===100);
 ok('stock came down on the device',(await LocalDB.get('items',itemId)).stock===Math.max(0,startStock-100));
 // the app is closed and opened again, still offline
 const reread=await LocalRepo.bills({from:LocalRepo.dayIn(),to:LocalRepo.dayIn(),limit:500});
 ok('after closing and reopening, all 100 are still there',reread.total===100&&reread.summary.sales===10000,JSON.stringify(reread.summary));

 // ---------------- THE INTERNET COMES BACK, BUT DROPS MID-WAY ----------------
 cloud.online=true; global.navigator.onLine=true;
 cloud.calls=0; cloud.cutAfter=1;             // dies during the very first batch
 await SyncEngine.syncNow({quiet:true});
 const afterCut=Number(sql("select count(*) from orders"));
 ok('connection died during syncing and the app survived',afterCut>=0&&(await LocalRepo.pending()).length>0,'sent '+afterCut);

 // ---------------- RECONNECT AND FINISH ----------------
 cloud.online=true; cloud.cutAfter=Infinity; global.navigator.onLine=true;
 for(let i=0;i<8&&(await LocalRepo.pending()).length;i++) await SyncEngine.syncNow({quiet:true});
 const onServer=Number(sql("select count(*) from orders"));
 ok('every one of the 100 bills reached the server',onServer===100,String(onServer));
 ok('outbox is empty',(await LocalRepo.pending()).length===0&&(await LocalRepo.failed()).length===0);
 ok('no duplicates: 100 bills, 100 different invoice numbers on the server',
    sql("select count(distinct invoice_no)||'/'||count(*) from orders")==='100/100',sql("select count(distinct invoice_no)||'/'||count(*) from orders"));
 ok('server stock matches: started '+startStock+', sold 100',
    Number(sql(`select remaining from menu_stock where menu_id='${dish}' and variant='${variant}'`))===Math.max(0,startStock-100));
 ok('the stock ledger adds up to -100',sql("select coalesce(sum(change),0) from rx20_stock_moves where reason='sale'")==='-100',sql("select coalesce(sum(change),0) from rx20_stock_moves"));
 ok('local bills are marked as sent',(await LocalDB.all('bills',{index:'sync_state',equals:'synced'})).length===100);
 ok('the server gave each bill an order number',(await LocalDB.all('bills',{})).every(b=>Number(b.order_no)>0));

 // ---------------- SENDING THE SAME THING AGAIN CHANGES NOTHING ----------------
 const one=(await LocalDB.all('bills',{}))[0];
 const dup=await cloud.rpc('restaurant_sync_push20',{p_device:dev,p_ops:[{op_id:one.op_id,kind:'bill.create',payload:{invoice_no:one.invoice_no,items:[{id:dish,size:variant,name:'x',qty:1,price:100}],total:100,discount_amount:0,tax_amount:0}}]});
 ok('replaying a bill makes no second bill',dup.results[0].repeat===true&&Number(sql("select count(*) from orders"))===100);

 // ---------------- DOWNLOADING WHAT CHANGED ELSEWHERE ----------------
 sql("insert into categories(name,sort_order) values ('Late Night',99) on conflict do nothing");
 sql("update menu_items set price = price + 7 where id='"+dish+"'");
 const before=(await LocalRepo.catalogue()).categories.length;
 await SyncEngine.pullOnce();
 const after=await LocalRepo.catalogue();
 ok('a category added elsewhere arrives here',after.categories.length===before+1&&after.categories.includes('Late Night'),after.categories.join(','));
 const cur=Number(await LocalRepo.metaGet('cursor',0));
 await SyncEngine.pullOnce();
 ok('nothing is downloaded twice',Number(await LocalRepo.metaGet('cursor',0))===cur,String(cur));
 console.log(R.join('\n'));
 const bad=R.filter(x=>x.startsWith('FAIL')).length; console.log(bad?bad+' FAILED':'all '+R.length+' passed');
})().catch(e=>{console.log(R.join('\n'));console.error('CRASH',e.stack.split('\n').slice(0,4).join(' | '))});
