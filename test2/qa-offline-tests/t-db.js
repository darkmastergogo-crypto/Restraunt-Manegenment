const path='/home/claude/src/WEBSITE/billing-suite/offline/local-db.js';
const LocalDB=require(path); const runner=require('/home/claude/qa/off/sqlite-runner.js');
const R=[],ok=(n,c,x='')=>R.push((c?'PASS ':'FAIL ')+n+(x?' — '+String(x).slice(0,160):''));
(async()=>{
 const r=runner(); await LocalDB.open({runner:r});
 ok('sqlite driver chosen',LocalDB.kind==='sqlite',LocalDB.kind);
 await LocalDB.put('items',{id:'a',name:'Momo',category:'Steamed',price:100});
 await LocalDB.put('items',{id:'b',name:'Noodle',category:'Noodles',price:140});
 await LocalDB.put('items',{id:'c',name:'Soup',category:'Soups',price:110});
 ok('read back whole row',(await LocalDB.get('items','a')).name==='Momo');
 ok('count',await LocalDB.count('items')===3);
 const byCat=await LocalDB.all('items',{index:'category',equals:'Noodles'});
 ok('query by index',byCat.length===1&&byCat[0].id==='b',JSON.stringify(byCat.map(x=>x.id)));
 await LocalDB.put('items',{id:'a',name:'Momo v2',category:'Steamed',price:120});
 ok('update in place',(await LocalDB.get('items','a')).name==='Momo v2'&&await LocalDB.count('items')===3);
 // range + order + limit
 for(let i=0;i<5;i++)await LocalDB.put('bills',{id:'b'+i,bill_day:'2026-11-0'+(i+1),created_at:'2026-11-0'+(i+1)+'T10:00:00Z',sync_state:'pending',total:i});
 const range=await LocalDB.all('bills',{index:'bill_day',from:'2026-11-02',to:'2026-11-04'});
 ok('range query',range.length===3,JSON.stringify(range.map(b=>b.bill_day)));
 const desc=await LocalDB.all('bills',{index:'created_at',desc:true,limit:2});
 ok('newest first + limit',desc.length===2&&desc[0].id==='b4',JSON.stringify(desc.map(b=>b.id)));
 // all-or-nothing
 try{ await LocalDB.tx(['bills','outbox'],async h=>{ await h.put('bills',{id:'tx1',bill_day:'x',total:1}); await h.put('outbox',{op_id:'o1',state:'pending'}); throw Error('boom'); }); }catch{}
 ok('failed transaction leaves nothing behind',!(await LocalDB.get('bills','tx1'))&&!(await LocalDB.get('outbox','o1')));
 await LocalDB.tx(['bills','outbox'],async h=>{ await h.put('bills',{id:'tx2',bill_day:'x',total:1}); await h.put('outbox',{op_id:'o2',state:'pending'}); });
 ok('good transaction writes both',!!(await LocalDB.get('bills','tx2'))&&!!(await LocalDB.get('outbox','o2')));
 ok('delete',await LocalDB.del('items','c')&&!(await LocalDB.get('items','c')));
 // survives reopening the file
 const f='/tmp/claude-0/till-test.db'; require('fs').rmSync(f,{force:true});
 const LocalDB2=require(path); // same module object; reopen against a file
 const r2=runner(f); const d2=LocalDB2._sqlDriver(r2); await d2.open();
 await d2.tx(['bills'],async h=>h.put('bills',{id:'keep',bill_day:'2026-11-07',total:42}));
 const r3=runner(f); const d3=LocalDB2._sqlDriver(r3); await d3.open();
 const kept=await d3.read(['bills'],h=>h.get('bills','keep'));
 ok('data is still there after closing and reopening',kept&&kept.total===42,JSON.stringify(kept));
 const wal=await r3.select('PRAGMA journal_mode'); ok('write-ahead logging on',String(wal[0].journal_mode).toLowerCase()==='wal',JSON.stringify(wal[0]));
 console.log(R.join('\n'));
 console.log(R.filter(x=>x.startsWith('FAIL')).length?'SOME FAILED':'all '+R.length+' passed');
})().catch(e=>{console.log(R.join('\n'));console.error('CRASH',e.message)});
