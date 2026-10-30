// PLAYWRIGHT_MODULE can point to an existing Playwright installation.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 for (const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
  const context=await browser.newContext({viewport}); const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173');
  await page.getByLabel('Responsable',{exact:true}).fill('María Pérez');
  await page.getByLabel('Buscar productos').fill('Masa');
  await page.getByRole('button',{name:'Masa para pizza kg'}).click();
  await page.getByLabel('Cantidad de Masa para pizza').fill('2.5');
  await page.getByRole('button',{name:/^Guardar pedido/}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Sí, guardar pedido'}).click();
  await page.getByRole('status').filter({hasText:'guardado en este dispositivo'}).waitFor();
  await page.getByRole('button',{name:'Historial'}).click();
  await page.getByRole('article').getByText('María Pérez',{exact:true}).waitFor();
  await page.getByRole('article').getByText('2,5 kg',{exact:true}).waitFor();
  await page.reload();
  await page.getByRole('button',{name:'Historial'}).click();
  await page.getByRole('article').getByText('María Pérez',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
  assert.deepEqual(errors,[],'No browser errors');
  console.log(`PASS ${viewport.width}px: search, quantity, save, history, persistence, no overflow or browser errors`);
  await context.close();
 }
} finally {await browser.close();}
