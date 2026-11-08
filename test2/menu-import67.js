/* Release 67: strict client preflight + server-side atomic CSV commit. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const allowed=new Set(['name','code','category','unit','price','cost_price','stock','low_stock_at','hsn','tax_rate','default_discount','alias','description','veg','available','visible','recommended','bestseller','image_url']);
 const parse=csv=>{const rows=[];let row=[],cell='',q=false;for(let i=0;i<csv.length;i++){const c=csv[i],n=csv[i+1];if(c==='"'&&q&&n==='"'){cell+='"';i++;}else if(c==='"')q=!q;else if(c===','&&!q){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}if(q)throw Error('CSV has an unclosed quote.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;};
 const bool=(v,row,field,errors)=>{if(v==='')return undefined;if(/^(true|false)$/i.test(v))return /^true$/i.test(v);errors.push(`Row ${row}: ${field} must be true or false.`);};
 const numeric=(v,row,field,errors)=>{if(v==='')return undefined;if(!/^-?\d+(\.\d+)?$/.test(v)){errors.push(`Row ${row}: ${field} must be numeric.`);return undefined;}return Number(v);};
 async function importFile(file){
  const state=$('csvImportStatus');state.textContent='Uploading CSV…';
  const rows=parse(await file.text());if(rows.length<2)throw Error('CSV needs a header and at least one item.');
  const heads=rows.shift().map(x=>x.trim().toLowerCase()),errors=[];
  if(!heads.includes('name')||!heads.includes('price'))errors.push('Headers name and price are required.');
  for(const h of heads)if(!allowed.has(h))errors.push(`Unsupported header: ${h}.`);
  if(new Set(heads).size!==heads.length)errors.push('Duplicate CSV headers.');
  const data=rows.map((r,i)=>{const o={};heads.forEach((h,j)=>o[h]=(r[j]??'').trim());const line=i+2;
   if(r.length!==heads.length)errors.push(`Row ${line}: expected ${heads.length} columns but found ${r.length}.`);
   if(!o.name)errors.push(`Row ${line}: name is required.`);
   if(!/^\d+(\.\d{1,2})?$/.test(o.price||''))errors.push(`Row ${line}: invalid price.`);
   for(const k of ['cost_price','stock','low_stock_at','tax_rate','default_discount'])numeric(o[k]??'',line,k,errors);
   for(const k of ['veg','available','visible','recommended','bestseller']){const v=bool(o[k]??'',line,k,errors);if(v!==undefined)o[k]=v;else delete o[k];}
   return o;});
  if(errors.length)throw Error(`Nothing imported. ${errors.join(' ')}`);
  state.textContent=`Preparing categories for ${data.length} items…`;
  const {names}=await CsvCategories.ensure(Cloud.rpc,data.map(row=>row.category));
  const result=await Cloud.rpc('restaurant_import_menu67',{p_rows:data.map(row=>({...row,category:names.get(row.category)}))},true);
  if(!result.ok){const message=(result.errors||[]).map(e=>`Row ${e.row}: ${e.message}`).join(' ');throw Error(`Nothing imported. ${message}`);}
  state.textContent=`Completed: ${result.committed} committed (${result.created} new, ${result.updated} updated). Synchronizing menu…`;
  await refreshCloud();await loadStaffMenuPage63(true);setTimeout(()=>state.textContent='',7000);
 }
 window.openCsvImport67=()=>$('csvImportFile').click();
 document.addEventListener('DOMContentLoaded',()=>{$('csvImportFile')?.addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{await importFile(f);showToast('CSV import completed.');}catch(err){$('csvImportStatus').textContent=err.message;showToast('CSV import failed. No records were committed.');}});});
})();
