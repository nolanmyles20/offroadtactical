'use strict';
const $ = id => document.getElementById(id);
const money = value => value == null ? 'Price pending' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
let catalog, zoom=1;
const state={firearm:'',optic:'',light:''};
const findGun=()=>catalog.firearms.find(x=>x.id===state.firearm);
const findAccessory=id=>catalog.accessories.find(x=>x.id===id);
const compatible=(gun,item)=>!!gun && !!item && item.stock && item.compatibleMounts.includes(item.category==='optic'?gun.opticMount:gun.lightMount);
function fillSelect(el,items,selected){el.replaceChildren();for(const item of items){const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.name+(item.id==='none'?'':` · ${money(item.price)}`);el.append(opt);}el.value=selected;}
function setImage(el,item){el.onerror=()=>{el.onerror=null;el.src=item.fallbackImage||'assets/pistol.svg';};el.src=item.image;}
function render(){const gun=findGun();if(!gun)return;
  fillSelect($('firearm'),catalog.firearms.filter(x=>x.stock),state.firearm);
  for(const category of ['optic','light']){
    const choices=catalog.accessories.filter(x=>x.category===category&&x.stock);
    // The Osight R is a selectable rifle optic even when its fitment has not been verified.
    if(category==='optic' && gun.id==='psa-pa15') choices.sort((a,b)=>(a.id==='osight-r'?-1:b.id==='osight-r'?1:0));
    if(state[category]!=='none'&&!choices.some(x=>x.id===state[category]))state[category]='none';
    fillSelect($(category),[{id:'none',name:'None'},...choices],state[category]);
  }
  setImage($('firearmImage'),gun);$('firearmImage').alt=gun.name; $('firearmImage').style.width=(gun.previewScale||100)+'%'; $('firearmImage').style.left='50%'; $('firearmImage').style.transform='translateX(-50%)';
  for(const category of ['optic','light']){
    const el=$(category+'Image'),item=findAccessory(state[category]),position=category==='optic'?gun.opticPosition:gun.lightPosition;
    el.hidden=!item || item.previewApproved===false;
    if(item){setImage(el,item);el.alt=item.name;el.style.left=position.x+'%';el.style.top=position.y+'%';el.style.width=position.width+'%';}
  }
  const refBox=$('accessoryReference'); if(refBox)refBox.hidden=true;
  $('imageNote').textContent='Images are illustrative. Verify exact firearm model, mounting compatibility, and hardware before purchase.';
  const optic=findAccessory(state.optic),light=findAccessory(state.light),lines=[gun,optic,light].filter(Boolean);
  $('buildLines').replaceChildren();for(const item of lines){const row=document.createElement('div');row.className='line';const name=document.createElement('span');name.textContent=item.name;const price=document.createElement('span');price.textContent=money(item.price);row.append(name,price);$('buildLines').append(row);}
  $('total').textContent=lines.every(x=>x.price!=null)?money(lines.reduce((sum,x)=>sum+x.price,0)):'Pricing not available';
  $('compatibility').textContent='PRELIMINARY CATALOG: Imported Square products appear in selections but are not drawn as mounted until manually calibrated and fitment verified. Accessory selection is for visualization only, NOT a verified fitment recommendation. Confirm exact PSA SKU, optic footprint/adapter, rail type, and mounting hardware before purchase. The standard Dagger slide has no optic mount.';
  const url=new URL(location.href);for(const key of ['firearm','optic','light'])url.searchParams.set(key,state[key]);history.replaceState(null,'',url);
}
function summary(){const gun=findGun(),optic=findAccessory(state.optic),light=findAccessory(state.light);return `Offroad Tactical build\nFirearm: ${gun.name}\nOptic: ${optic?.name||'None'}\nLight: ${light?.name||'None'}\nEstimated total: ${$('total').textContent}\nIllustrative preview; accessory fit NOT verified; pricing and availability pending.`;}
async function copy(text){try{await navigator.clipboard.writeText(text);$('message').textContent='Copied to clipboard.';}catch{$('message').textContent='Clipboard unavailable. Try opening the site over HTTPS.';}}
async function init(){try{const response=await fetch('catalog.json',{cache:'no-store'});if(!response.ok)throw Error('Catalog not found');catalog=await response.json();
 // Square imports are additional product listings, not automatically approved mount overlays.
 try {const sr=await fetch('square-products.json',{cache:'no-store'});if(sr.ok){const sq=await sr.json();const ids=new Set(catalog.accessories.map(x=>x.id));for(const item of (sq.accessories||[])){if(!ids.has(item.id)){catalog.accessories.push(item);ids.add(item.id);}}}}catch(e){console.warn('Square sync unavailable; using base catalog',e);}
 const params=new URLSearchParams(location.search),guns=catalog.firearms.filter(x=>x.stock);if(!guns.length)throw Error('No available firearms in catalog');
 state.firearm=guns.some(x=>x.id===params.get('firearm'))?params.get('firearm'):(guns.find(x=>x.id==='psa-pa15')||guns[0]).id;
 for(const category of ['optic','light'])state[category]=params.get(category)||'none';
 $('firearm').addEventListener('change',e=>{state.firearm=e.target.value;render();});
 for(const category of ['optic','light'])$(category).addEventListener('change',e=>{state[category]=e.target.value;render();});
 $('zoomIn').onclick=()=>{zoom=Math.min(1.8,zoom+.15);$('art').style.setProperty('--zoom',zoom)};
 $('zoomOut').onclick=()=>{zoom=Math.max(.7,zoom-.15);$('art').style.setProperty('--zoom',zoom)};
 $('zoomReset').onclick=()=>{zoom=1;$('art').style.setProperty('--zoom',zoom)};
 $('copyBuild').onclick=()=>copy(summary());$('shareBuild').onclick=()=>copy(location.href);
 $('year').textContent=new Date().getFullYear();render();
 }catch(error){$('compatibility').textContent='Could not load catalog: '+error.message+' (serve this folder using a local web server or GitHub Pages).';}}
init();
