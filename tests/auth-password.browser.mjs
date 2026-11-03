import{test,expect}from'@playwright/test';
import{clickSidebar}from'./helpers/sidebar.mjs';
test('password sign-in submits credentials to Auth, handles rejection, and opens the assigned screen',async({page})=>{
 const user={id:'22222222-2222-4222-8222-222222222222',email:'staff@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
 let attempts=0;
 await page.route('https://auth-fixture.invalid/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/auth/v1/token'){
   expect(url.searchParams.get('grant_type')).toBe('password');const body=route.request().postDataJSON();expect(body.email).toBe(user.email);attempts++;
   if(attempts===1){expect(body.password).toBe('Wrong-test-password-41');await route.fulfill({status:400,json:{code:'invalid_credentials',msg:'Invalid login credentials'}});return;}
   expect(body.password).toBe('New-test-password-42');
   const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'},'fixture'].map(value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url')).join('.');
   await route.fulfill({json:{access_token:token,refresh_token:'fixture-refresh-token',token_type:'bearer',expires_in:3600,user}});return;
  }
  if(url.pathname==='/auth/v1/user'){await route.fulfill({json:user});return;}
  if(url.pathname==='/rest/v1/user_roles'){await route.fulfill({json:{role:'bakery'}});return;}
  if(url.pathname.startsWith('/rest/v1/')){await route.fulfill({json:[]});return;}
  await route.fulfill({status:400,json:{error:'Unexpected fixture request'}});
 });
 await page.goto('/');await expect(page).toHaveTitle('Picui · Pedidos');await expect(page.getByLabel('Cuenta de prueba')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Ingresá a tu espacio'})).toBeVisible();
 await page.getByLabel('Correo electrónico',{exact:true}).fill(user.email);await page.getByLabel('Contraseña',{exact:true}).fill('Wrong-test-password-41');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Revisá el correo y la contraseña');await expect(page.getByLabel('Contraseña',{exact:true})).toHaveValue('');
 await page.getByLabel('Contraseña',{exact:true}).fill('New-test-password-42');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Nuevo pedido',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/Cerrar sesión/})).toBeVisible();expect(attempts).toBe(2);
});

for(const role of ['bakery','warehouse','admin',null]) {
 test(`restored ${role ?? 'unassigned'} session checks access once and loads only its screen`,async({page})=>{
  const user={id:'22222222-2222-4222-8222-222222222222',email:'staff@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
  const expires_at=Math.floor(Date.now()/1000)+3600;
  const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:expires_at,aud:'authenticated',role:'authenticated'},'fixture'].map(value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url')).join('.');
  const session={access_token:token,refresh_token:'fixture-refresh-token',token_type:'bearer',expires_in:3600,expires_at,user};
  await page.addInitScript(session=>localStorage.setItem('sb-auth-fixture-auth-token',JSON.stringify(session)),session);
  const requests={user_roles:0,products:0,productions:0,production_audit:0};
  await page.route('https://auth-fixture.invalid/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/auth/v1/user'){await route.fulfill({json:user});return;}
   if(url.pathname==='/auth/v1/logout'){await route.fulfill({status:204});return;}
   const table=url.pathname.split('/').at(-1);
   if(table in requests){requests[table]++;await route.fulfill({json:table==='user_roles' ? (role?{role}:null) : []});return;}
   await route.fulfill({status:400,json:{error:'Unexpected fixture request'}});
  });
  await page.goto('/');
  const heading=page.getByRole('heading',{name:role==='bakery'?'Nuevo pedido':role==='warehouse'?'Depósito':role==='admin'?'Administración':'Acceso pendiente',exact:true});
  await expect(page.getByRole('button',{name:/Cerrar sesión/})).toBeVisible();
  await expect(page.getByText('Verificando acceso…',{exact:true})).toHaveCount(0);
  await expect(heading).toBeVisible();
  expect(requests).toEqual({user_roles:1,products:role?1:0,productions:role==='warehouse'?1:0,production_audit:role==='admin'?1:0});
  if(role==='bakery')await page.getByLabel('Responsable',{exact:true}).fill('Draft retained');
  // Exercise the same SDK events emitted by refocusing a tab and token renewal.
  await page.evaluate(async session=>{
   const {supabase}=await import('/src/lib/supabase.ts');
   await supabase.auth._notifyAllSubscribers('SIGNED_IN',session);
   await supabase.auth._notifyAllSubscribers('TOKEN_REFRESHED',session);
   await new Promise(resolve=>setTimeout(resolve,50));
  },session);
  expect(requests.user_roles).toBe(1);
  await expect(heading).toBeVisible();
  if(role==='bakery'){
   await expect(page.getByLabel('Responsable',{exact:true})).toHaveValue('Draft retained');
   await clickSidebar(page,'Historial');
   await expect.poll(()=>requests.productions).toBe(1);
   await expect(page.getByText('Verificando acceso…',{exact:true})).toHaveCount(0);
  }
  await page.getByRole('button',{name:/Cerrar sesión/}).click();
  await expect(page.getByRole('heading',{name:'Ingresá a tu espacio'})).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
 });
}
