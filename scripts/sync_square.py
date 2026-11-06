"""Best-effort public Square storefront sync. Fails closed on extraction errors."""
import asyncio, json, re, os, hashlib
from pathlib import Path
from urllib.parse import urljoin, urlparse
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'gun-builder'/'square-products.json'
ASSETS=ROOT/'gun-builder'/'assets'/'square'
CATEGORIES={
 'optic':'https://offroad-tactical.square.site/shop/osight/DB6RN7KRHJIMP4RSKX3CAS4H',
 'light':'https://offroad-tactical.square.site/shop/weapon-lights/4PXCXMHOD3YTANEKT65WH7JV?page=1&limit=30&sort_by=category_order&sort_order=asc'
}

def slug(s):
 return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')[:65]

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1400,'height':1000})
  results=[]
  for category,url in CATEGORIES.items():
   await page.goto(url,wait_until='domcontentloaded',timeout=60000)
   await page.wait_for_timeout(4000)
   # Discover actual product cards from product links, not arbitrary site images.
   cards=await page.evaluate('''() => Array.from(document.querySelectorAll('a[href*="/product/"]')).map(a => {
     const box=a.closest('article,li,[class*="product"],[class*="Product"]')||a;
     const img=box.querySelector('img')||a.querySelector('img');
     return {name:(a.innerText||img?.alt||'').trim(),href:a.href,image:img?.currentSrc||img?.src||''};
   })''')
   seen=set(); count=0
   for item in cards:
    name=' '.join(item['name'].split())[:140]
    if not name or not item['image'] or not item['href'] or item['href'] in seen: continue
    seen.add(item['href'])
    # A product image is downloaded only when the source serves an actual image.
    try:
     resp=await page.request.get(item['image'],timeout=20000)
     if not resp.ok or not resp.headers.get('content-type','').startswith('image/'):continue
     data=await resp.body()
     if len(data)>8_000_000 or len(data)<300:continue
     ext='.png' if 'png' in resp.headers['content-type'] else '.webp' if 'webp' in resp.headers['content-type'] else '.jpg'
     ident=hashlib.sha256(item['href'].encode()).hexdigest()[:10]
     filename=f'{slug(name)}-{ident}{ext}'
     ASSETS.mkdir(parents=True,exist_ok=True)
     (ASSETS/filename).write_bytes(data)
     results.append({'id':'square-'+ident,'name':name,'category':category,'price':None,'stock':True,'image':'assets/square/'+filename,'sourceUrl':item['href'],'compatibleMounts':[],'fitmentVerified':False,'previewApproved':False,'fallbackImage':'assets/'+('optic' if category=='optic' else 'light')+'.svg'})
     count+=1
    except Exception as exc: print('Skipped image:',name,str(exc)[:100])
   print(category,'products found:',count)
   if count==0:
    await browser.close()
    raise RuntimeError('No validated products found in '+category+'; existing catalog left untouched. Square markup may have changed.')
  await browser.close()
  # Write only after BOTH categories succeeded; keep existing data on failure.
  OUT.write_text(json.dumps({'accessories':results},indent=2)+'\n',encoding='utf-8')
  print('Wrote',len(results),'products')

if __name__=='__main__':asyncio.run(main())
