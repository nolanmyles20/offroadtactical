'use strict';
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
let catalog, zoom=1;
const state={firearm:'',optic:'',light:''};
const findGun=()=>catalog.firearms.find(x=>x.id===state.firearm);
const findAccessory=id=>catalog.accessories.find(x=>x.id===id);
const compatible=(gun,item)=>!!gun && !!item && item.stock && item.compatibleMounts.includes(item.category==='optic'?gun.opticMount:gun.lightMount);
function fillSelect(el,items,selected){el.replaceChildren();for(const item of items){const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.name+(item.id==='none'?'':` · ${money(item.price)}`);el.append(opt);}el.value=selected;}
function render(){const gun=findGun();if(!gun)return;
  fillSelect($('firearm'),catalog.firearms.filter(x=>x.stock),state.firearm);
  for(const category of ['optic','light']){
    const choices=catalog.accessories.filter(x=>x.category===category&&compatible(gun,x));
    if(state[category]!=='none'&&!choices.some(x=>x.id===state[category]))state[category]='none';
    fillSelect($(category),[{id:'none',name:'None'},...choices],state[category]);
  }
  $('firearmImage').src=gun.image;$('firearmImage').alt=gun.name;
  for(const category of ['optic','light']){
    const el=$(category+'Image'),item=findAccessory(state[category]),position=category==='optic'?gun.opticPosition:gun.lightPosition;
    el.hidden=!item;
    if(item){el.src=item.image;el.alt=item.name;el.style.left=position.x+'%';el.style.top=position.y+'%';el.style.width=position.width+'%';}
  }
  $('imageNote').textContent=gun.note+' Preview positioning is illustrative, not proof of fit.';
  const optic=findAccessory(state.optic),light=findAccessory(state.light),lines=[gun,optic,light].filter(Boolean);
  $('buildLines').replaceChildren();for(const item of lines){const row=document.createElement('div');row.className='line';const name=document.createElement('span');name.textContent=item.name;const price=document.createElement('span');price.textContent=money(item.price);row.append(name,price);$('buildLines').append(row);}
  $('total').textContent=money(lines.reduce((sum,x)=>sum+x.price,0));
  $('compatibility').textContent='Only accessories matching the catalog’s declared mount types are shown. Verify each real SKU before publishing.';
  const url=new URL(location.href);for(const key of ['firearm','optic','light'])url.searchParams.set(key,state[key]);history.replaceState(null,'',url);
}
function summary(){const gun=findGun(),optic=findAccessory(state.optic),light=findAccessory(state.light);return `Offroad Tactical build\nFirearm: ${gun.name}\nOptic: ${optic?.name||'None'}\nLight: ${light?.name||'None'}\nEstimated total: ${$('total').textContent}\nIllustrative preview; verify fit and availability.`;}
async function copy(text){try{await navigator.clipboard.writeText(text);$('message').textContent='Copied to clipboard.';}catch{$('message').textContent='Clipboard unavailable. Try opening the site over HTTPS.';}}
async function init(){try{const response=await fetch('catalog.json',{cache:'no-store'});if(!response.ok)throw Error('Catalog not found');catalog=await response.json();
 const params=new URLSearchParams(location.search),guns=catalog.firearms.filter(x=>x.stock);if(!guns.length)throw Error('No available firearms in catalog');
 state.firearm=guns.some(x=>x.id===params.get('firearm'))?params.get('firearm'):guns[0].id;
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
