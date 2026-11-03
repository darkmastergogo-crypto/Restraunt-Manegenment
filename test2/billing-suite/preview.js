/* Read-only local fixtures for reviewing the actual shipped components. */
'use strict';
const App = { publicInfo: {}, applyBrand(){}, rebuildNav(){}, applyShop(){}, applyTheme(){}, refreshMe:async()=>Store.me };
const fixtureItems = ['DOMS A1 PENCIL','DOMS CLAY SKOODLE','DOMS CUTTER WITH RUBBER','DOMS DRAWING PENCIL','DOMS E-RACER ERASER','DOMS EVERYDAY BALL PEN BLACK','DOMS EXTRA LONG SHARPENER','DOMS FEVI GUM'].map((name,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),name,price:[5,50,10,50,5,4,5,10][i],unit:'pcs',stock:[86,7,16,5,37,117,57,9][i],track_stock:true,low_stock:0,category:'Colours & Art',active:true}));
Store.me={role:'superadmin',name:'Admin',email:'preview@example.test',today:'2026-11-03',perms:PERMISSIONS.flatMap(g=>g[1].map(p=>p[0])).concat('admin'),settings:{shop_name:'My Restaurant',currency:'₹',timezone:'Asia/Kolkata',bill_prefix:'INV-',tax_enabled:false,tax_mode:'percent',tax_value:0,round_off:false,invoice:{},bill_design:{}},system:{modules:{members:true},features:{},payments:{Cash:true,UPI:true,Card:true},appearance:{theme:'ledger'},brand:{},roles:{manager:[],cashier:[]}}};
Store.items=fixtureItems;Store.categories=['Colours & Art'];Store.itemsLoadedAt=Date.now();
Cloud.rpc=async(name)=>{if(name==='shop_items_list')return {items:fixtureItems,categories:Store.categories};if(name==='shop_staff_list')return [];if(name==='shop_me')return Store.me;throw Error('Read-only preview: this action needs the installed database.');};
Cloud.publicRpc=async()=>({});
const modules={billing:Billing,settings:Settings,items:Items,stocks:Stocks,expenses:Expenses,members:Members,records:Records,dashboard:Dashboard,admin:Admin};let mounted;
function previewRoute(){const route=location.hash.slice(2)||'billing';mounted?.unmount?.();const root=document.querySelector('#view');root.replaceChildren();mounted=modules[route]||Billing;document.querySelector('#topTitle').textContent=route[0].toUpperCase()+route.slice(1);mounted.mount(root);}
Themes.apply('ledger');addEventListener('hashchange',previewRoute);previewRoute();
