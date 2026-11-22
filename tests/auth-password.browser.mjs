import {chooseIngredient} from './helpers/formulation-fields.mjs';
import{test,expect}from'@playwright/test';
import{clickSidebar}from'./helpers/sidebar.mjs';
test('password sign-in opens the assigned screen and orders use the account name',async({page})=>{
 const user={id:'22222222-2222-4222-8222-222222222222',email:'staff@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{name:'Cuenta Panadería'},created_at:new Date().toISOString()};
 let attempts=0;
 let savedResponsible;
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
  if(url.pathname==='/rest/v1/products'){await route.fulfill({json:[{id:'33333333-3333-4333-8333-333333333333',name:'Harina',unit:'kg',category:'materia_prima'}]});return;}
  if(url.pathname==='/rest/v1/rpc/save_production'){
   savedResponsible=route.request().postDataJSON().p_responsible;
   await route.fulfill({json:'44444444-4444-4444-8444-444444444444'});return;
  }
  if(url.pathname.startsWith('/rest/v1/')){await route.fulfill({json:[]});return;}
  await route.fulfill({status:400,json:{error:'Unexpected fixture request'}});
 });
 await page.goto('/');await expect(page).toHaveTitle('Picui · Pedidos');await expect(page.getByLabel('Cuenta de prueba')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Ingresá a tu espacio'})).toBeVisible();
 await page.getByLabel('Correo electrónico',{exact:true}).fill(user.email);await page.getByLabel('Contraseña',{exact:true}).fill('Wrong-test-password-41');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Revisá el correo y la contraseña');await expect(page.getByLabel('Contraseña',{exact:true})).toHaveValue('');
 await page.getByLabel('Contraseña',{exact:true}).fill('New-test-password-42');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Nuevo pedido',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/Cerrar sesión/})).toBeVisible();expect(attempts).toBe(2);
 await page.getByRole('button',{name:'Harina kg'}).click();
 await page.getByLabel('Cantidad de Harina').fill('2');
 await page.getByRole('button',{name:/^Guardar pedido/}).click();
 const review=page.getByRole('dialog',{name:'Revisá tu pedido'});
 await expect(review).toContainText(user.user_metadata.name);
 await review.getByRole('button',{name:'Sí, guardar pedido'}).click();
 await expect(page.getByRole('status')).toContainText('Pedido guardado');
 expect(savedResponsible).toBe(user.user_metadata.name);
});

for(const role of ['bakery','warehouse','admin',null]) {
 test(`restored ${role ?? 'unassigned'} session checks access once and loads only its screen`,async({page})=>{
  const user={id:'22222222-2222-4222-8222-222222222222',email:'staff@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
  const expires_at=Math.floor(Date.now()/1000)+3600;
  const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:expires_at,aud:'authenticated',role:'authenticated'},'fixture'].map(value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url')).join('.');
  const session={access_token:token,refresh_token:'fixture-refresh-token',token_type:'bearer',expires_in:3600,expires_at,user};
  await page.addInitScript(session=>localStorage.setItem('sb-auth-fixture-auth-token',JSON.stringify(session)),session);
  const requests={user_roles:0,products:0,productions:0,production_audit:0};
  const warehouseOrder={
   id:'55555555-5555-4555-8555-555555555555',date:'2026-11-20',responsible:'Cuenta Panadería',
   production_items:[
    {product_id:'harina',name:'Harina',code:'001',unit:'kg',quantity:2,products:{category:'materia_prima'}},
    {product_id:'manga',name:'Manga descartable',code:'002',unit:'unidades',quantity:3,products:{category:'insumos'}}
   ]
  };
  let releaseData;
  const dataGate=new Promise(resolve=>{releaseData=resolve;});
  await page.route('https://auth-fixture.invalid/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/auth/v1/user'){await route.fulfill({json:user});return;}
   if(url.pathname==='/auth/v1/logout'){await route.fulfill({status:204});return;}
   const table=url.pathname.split('/').at(-1);
   if(table in requests){
    requests[table]++;
    if(table!=='user_roles')await dataGate;
    if(table==='productions' && role==='warehouse'){
     expect(url.searchParams.get('select')).toContain('production_items(*,products(category))');
     await route.fulfill({json:[warehouseOrder]});return;
    }
    await route.fulfill({json:table==='user_roles' ? (role?{role}:null) : []});return;
   }
   await route.fulfill({status:400,json:{error:'Unexpected fixture request'}});
  });
  await page.goto('/');
  const heading=page.getByRole('heading',{name:role==='bakery'?'Nuevo pedido':role==='warehouse'?'Depósito':role==='admin'?'Administración':'Acceso pendiente',exact:true});
  await expect(page.getByRole('button',{name:/Cerrar sesión/})).toBeVisible();
  await expect(page.getByText('Verificando acceso…',{exact:true})).toHaveCount(0);
  await expect(heading).toBeVisible();
  if(role){
   await expect(page.getByRole('tab')).toHaveCount(role==='admin'?3:1);
   if(role==='warehouse'){await expect(page.getByText('Cargando pedidos…',{exact:true})).toBeVisible();await expect(page.getByText('Todavía no hay pedidos recibidos',{exact:true})).toHaveCount(0);}
   if(role==='admin'){await expect(page.getByRole('button',{name:/Abrir depósito/})).toBeVisible();await expect(page.getByText('Cargando historial de cambios…',{exact:true})).toBeVisible();}
  }
  releaseData();
  await expect(page.getByText(/Cargando (datos|pedidos|historial de cambios)…/)).toHaveCount(0);
  expect(requests).toEqual({user_roles:1,products:role?1:0,productions:role==='warehouse'?1:0,production_audit:role==='admin'?1:0});
  if(role==='warehouse'){
   await page.getByRole('button',{name:'Mostrar detalle'}).click();
   await expect(page.getByRole('group',{name:'Materia prima'})).toContainText('001');
   await expect(page.getByRole('group',{name:'Insumos'})).toContainText('002');
  }
  const orderDate=page.getByLabel('Fecha del pedido',{exact:true});
  if(role==='bakery')await orderDate.fill('2026-11-02');
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
   await expect(orderDate).toHaveValue('2026-11-02');
   await clickSidebar(page,'Historial');
   await expect.poll(()=>requests.productions).toBe(1);
   await expect(page.getByText('Verificando acceso…',{exact:true})).toHaveCount(0);
  }
  await page.getByRole('button',{name:/Cerrar sesión/}).click();
  await expect(page.getByRole('heading',{name:'Ingresá a tu espacio'})).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
 });
}

test('authenticated batch start sends only choices and metadata, retains request id on retry and renders the saved snapshot',async({page})=>{
 const user={id:'22222222-2222-4222-8222-222222222222',email:'baker@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
 const expires_at=Math.floor(Date.now()/1000)+3600;
 const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:expires_at,aud:'authenticated',role:'authenticated'},'fixture'].map(value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url')).join('.');
 await page.addInitScript(session=>localStorage.setItem('sb-auth-fixture-auth-token',JSON.stringify(session)),{access_token:token,refresh_token:'fixture-refresh-token',token_type:'bearer',expires_in:3600,expires_at,user});
 const recipeId='b4e793b2-891b-4399-b4f3-fcb28b965681';
 const document={code:'PAN-MIGNON-PROV',name:'Pan mignón',family:'Panes',product_id:null,provisional:true,ingredients:[
  {id:'harina',name:'Harina Cañuelas',quantity:25,unit:'kg',optional:false,alternatives:['Harina Lealtad'],tolerance_lower:null,tolerance_upper:null},
  {id:'agua',name:'Agua',quantity:30,unit:'L',optional:false,alternatives:[],tolerance_lower:null,tolerance_upper:null}
 ]};
 const recipe={id:recipeId,code:document.code,name:'Nombre en borrador',active:true,revision:3,latest_version:2,current_version:1,versions:[{recipe_id:recipeId,version:1,status:'current',document,created_at:new Date().toISOString(),created_by:null,approved_at:new Date().toISOString(),approved_by:user.id}]};
 const attempts=[];let records=[];
 await page.route('https://auth-fixture.invalid/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/auth/v1/user'){await route.fulfill({json:user});return;}
  if(url.pathname==='/rest/v1/user_roles'){await route.fulfill({json:{role:'bakery'}});return;}
  if(url.pathname==='/rest/v1/formulation_recipes'){
   expect(url.searchParams.get('select')).toContain('formulation_recipe_versions!formulation_recipe_versions_recipe_id_fkey');
   await route.fulfill({json:[recipe]});return;
  }
  if(url.pathname==='/rest/v1/formulation_batches'){await route.fulfill({json:records});return;}
  if(url.pathname==='/rest/v1/rpc/start_formulation_batch'){
   expect(route.request().headers().authorization).toBe('Bearer '+token);
   const body=route.request().postDataJSON();attempts.push(body);
   expect(Object.keys(body).sort()).toEqual(['p_date','p_factor','p_recipe_id','p_recipe_version','p_request_id','p_responsible','p_selections']);
   expect(body.p_recipe_id).toBe(recipeId);expect(body.p_recipe_version).toBe(1);expect(body.p_factor).toBe(2);
   expect(body.p_selections).toEqual([{ingredient_id:'harina',choice:1},{ingredient_id:'agua',choice:0}]);
   if(attempts.length===1){await route.fulfill({status:400,json:{code:'XX000',message:'Simulated failed acknowledgement'}});return;}
   expect(body.p_request_id).toBe(attempts[0].p_request_id);
   const id='55555555-5555-4555-8555-555555555555';
   records=[{id,user_id:user.id,request_id:body.p_request_id,recipe_id:recipeId,recipe_version:1,date:body.p_date,responsible:body.p_responsible,factor:2,status:'in_progress',created_at:new Date().toISOString(),recipe_snapshot:document,ingredients:[{ingredient_id:'harina',name:'Harina Lealtad',choice:1,included:true,optional:false,unit:'kg',base_quantity:25,expected_quantity:50,tolerance_lower:null,tolerance_upper:null,lower_limit:null,upper_limit:null},{ingredient_id:'agua',name:'Agua',choice:0,included:true,optional:false,unit:'L',base_quantity:30,expected_quantity:60,tolerance_lower:null,tolerance_upper:null,lower_limit:null,upper_limit:null}]}];
   await route.fulfill({json:id});return;
  }
  if(url.pathname.startsWith('/rest/v1/')){await route.fulfill({json:[]});return;}
  await route.fulfill({status:400,json:{error:'Unexpected fixture request'}});
 });
 await page.goto('/');await clickSidebar(page,'Elaboraciones');await page.getByLabel('Receta vigente',{exact:true}).selectOption(recipeId);
 await chooseIngredient(page,1,1);
 await page.getByLabel('Fecha de producción',{exact:true}).fill('2026-11-17');await page.getByLabel('Responsable de elaboración',{exact:true}).fill('María');await page.getByLabel('Cantidad',{exact:true}).fill('2');
 if(!await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).isVisible()){if(!await page.getByText('Continuar más tarde (opcional)',{exact:true}).isVisible())await page.getByText('Más opciones',{exact:true}).click();await page.getByText('Continuar más tarde (opcional)',{exact:true}).click();}await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).click();await expect(page.getByRole('alert')).toContainText('No se pudo confirmar');
 await expect(page.getByRole('article')).toHaveCount(0);await expect(page.getByRole('status')).toHaveCount(0);await expect(page.getByLabel('Responsable de elaboración',{exact:true})).toHaveValue('María');
 if(!await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).isVisible()){if(!await page.getByText('Continuar más tarde (opcional)',{exact:true}).isVisible())await page.getByText('Más opciones',{exact:true}).click();await page.getByText('Continuar más tarde (opcional)',{exact:true}).click();}await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Elaboración iniciada'})).toBeVisible();
 await expect(page.getByRole('article')).toContainText('50 kg');await expect(page.getByRole('article')).toContainText('60 L');expect(attempts).toHaveLength(2);
 await expect(page.getByLabel('Cuenta de prueba')).toHaveCount(0);
});

test('authenticated weighing retries the same operation and incorporation never sends an unsaved amount',async({page})=>{
 const user={id:'22222222-2222-4222-8222-222222222222',email:'baker@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
 const expires_at=Math.floor(Date.now()/1000)+3600;
 const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:expires_at,aud:'authenticated',role:'authenticated'},'fixture'].map(value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url')).join('.');
 await page.addInitScript(session=>localStorage.setItem('sb-auth-fixture-auth-token',JSON.stringify(session)),{access_token:token,refresh_token:'fixture-refresh-token',token_type:'bearer',expires_in:3600,expires_at,user});
 const id='55555555-5555-4555-8555-555555555555';
 const ingredient=(ingredient_id,name,amount,unit)=>({ingredient_id,name,choice:0,included:true,optional:false,unit,base_quantity:amount,expected_quantity:amount,tolerance_lower:null,tolerance_upper:null,lower_limit:null,upper_limit:null});
 const batch={id,user_id:user.id,request_id:'66666666-6666-4666-8666-666666666666',recipe_id:'b4e793b2-891b-4399-b4f3-fcb28b965681',recipe_version:1,date:'2026-11-17',responsible:'Pesaje API',factor:1,status:'in_progress',created_at:new Date().toISOString(),recipe_snapshot:{code:'PAN-001',name:'Pan mignón',family:'Panes',product_id:null,provisional:true,ingredients:[]},ingredients:[ingredient('harina','Harina',25,'kg'),ingredient('agua','Agua',30,'L')],weighings:[],events:[]};
 const calls=[];
 await page.route('https://auth-fixture.invalid/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/auth/v1/user'){await route.fulfill({json:user});return;}
  if(url.pathname==='/rest/v1/user_roles'){await route.fulfill({json:{role:'bakery'}});return;}
  if(url.pathname==='/rest/v1/formulation_batches'){
   expect(url.searchParams.get('select')).toContain('weighings:formulation_weighings');expect(url.searchParams.get('select')).toContain('events:formulation_batch_events');await route.fulfill({json:[batch]});return;
  }
  if(url.pathname==='/rest/v1/rpc/record_formulation_weight'){
   expect(route.request().headers().authorization).toBe('Bearer '+token);const body=route.request().postDataJSON();calls.push(body);
   expect(Object.keys(body).sort()).toEqual(['p_action','p_actual_quantity','p_batch_id','p_expected_revision','p_expiry_date','p_ingredient_id','p_lot','p_note','p_request_id']);
   expect(body.p_batch_id).toBe(id);expect(body.p_ingredient_id).toBe('harina');
   if(calls.length===1){
    expect(body.p_action).toBe('save');expect(body.p_expected_revision).toBe(0);expect(body.p_actual_quantity).toBe(24.5);expect(body.p_lot).toBeNull();expect(body.p_expiry_date).toBeNull();
    batch.weighings=[{id:'77777777-7777-4777-8777-777777777777',batch_id:id,ingredient_id:'harina',unit:'kg',expected_quantity:25,actual_quantity:24.5,lower_limit:null,upper_limit:null,difference_quantity:-.5,difference_percent:-2,within_tolerance:null,lot:null,expiry_date:null,revision:1,recorded_by:user.id,recorded_at:new Date().toISOString(),incorporated:false,incorporated_by:null,incorporated_at:null}];
    await route.fulfill({status:400,json:{code:'XX000',message:'Simulated lost acknowledgement'}});return;
   }
   if(calls.length===2){expect(body.p_request_id).toBe(calls[0].p_request_id);expect(body.p_expected_revision).toBe(0);}
   if(calls.length===3){expect(body.p_action).toBe('incorporate');expect(body.p_expected_revision).toBe(1);expect(body.p_actual_quantity).toBeNull();expect(body.p_lot).toBeNull();expect(body.p_expiry_date).toBeNull();batch.weighings[0]={...batch.weighings[0],incorporated:true,incorporated_by:user.id,incorporated_at:new Date().toISOString(),revision:2};}
   await route.fulfill({json:batch});return;
  }
  if(url.pathname.startsWith('/rest/v1/')){await route.fulfill({json:[]});return;}
  await route.fulfill({status:400,json:{error:'Unexpected fixture request'}});
 });
 await page.goto('/');await clickSidebar(page,'Elaboraciones');await page.locator('details.resume > summary').click();const article=page.getByRole('article',{name:'Elaboración de Pesaje API - Pan mignón',exact:true});await article.getByRole('button',{name:'Ver cantidades sugeridas',exact:true}).click();
 const row=article.getByRole('listitem',{name:'Pesaje de Harina',exact:true});await row.getByLabel('Peso real de Harina',{exact:true}).fill('24,5');await row.getByRole('button',{name:'Registrar peso',exact:true}).click();
 await expect(row.getByRole('alert')).toContainText('No se pudo confirmar');await expect(row.getByRole('status')).toHaveCount(0);await expect(row.getByLabel('Peso real de Harina',{exact:true})).toHaveValue('24,5');
 await row.getByRole('button',{name:'Registrar peso',exact:true}).click();await expect(row.getByRole('status')).toContainText('Peso registrado');
 await row.getByLabel('Peso real de Harina',{exact:true}).fill('26');await expect(row.getByRole('button',{name:'Confirmar incorporación',exact:true})).toBeDisabled();
 await row.getByLabel('Peso real de Harina',{exact:true}).fill('24.5');await row.getByRole('button',{name:'Confirmar incorporación',exact:true}).click();await expect(row.getByRole('status')).toContainText('Incorporación confirmada');
 await expect(row.getByLabel('Peso real de Harina',{exact:true})).not.toBeEditable();expect(calls).toHaveLength(3);expect(batch.weighings).toHaveLength(1);expect(batch.weighings[0].actual_quantity).toBe(24.5);expect(batch.status).toBe('in_progress');
});

test('product selection accepts weights immediately and submits one authenticated complete operation',async({page})=>{
 const user={id:'22222222-2222-4222-8222-222222222222',email:'baker@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
 const expires_at=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256'},{sub:user.id,exp:expires_at,aud:'authenticated',role:'authenticated'},'fixture'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.');
 await page.addInitScript(s=>localStorage.setItem('sb-auth-fixture-auth-token',JSON.stringify(s)),{access_token:token,refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at,user});
 const recipeId='b4e793b2-891b-4399-b4f3-fcb28b965681',doc={code:'PAN',name:'Pan',family:'Panes',product_id:null,provisional:true,ingredients:[{id:'harina',name:'Harina',quantity:25,unit:'kg',optional:false,alternatives:[],tolerance_lower:null,tolerance_upper:null}]};let calls=0;
 await page.route('https://auth-fixture.invalid/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/auth/v1/user'){await route.fulfill({json:user});return;}
  if(path==='/rest/v1/user_roles'){await route.fulfill({json:{role:'bakery'}});return;}
  if(path==='/rest/v1/formulation_recipes'){await route.fulfill({json:[{id:recipeId,active:true,current_version:1,latest_version:1,versions:[{version:1,status:'current',document:doc}]}]});return;}
  if(path==='/rest/v1/rpc/complete_formulation_batch'){
   calls++;expect(route.request().headers().authorization).toBe('Bearer '+token);const body=route.request().postDataJSON();expect(body.p_factor).toBe(2);expect(body.p_weights).toEqual([{ingredient_id:'harina',actual_quantity:49,lot:null,expiry_date:null}]);expect(body.p_selections).toEqual([{ingredient_id:'harina',choice:0}]);
   const id='55555555-5555-4555-8555-555555555555',plan={ingredient_id:'harina',name:'Harina',choice:0,included:true,optional:false,unit:'kg',base_quantity:25,expected_quantity:50,lower_limit:null,upper_limit:null,tolerance_lower:null,tolerance_upper:null};
   await route.fulfill({json:{id,user_id:user.id,recipe_id:recipeId,recipe_version:1,recipe_snapshot:doc,date:body.p_date,responsible:body.p_responsible,factor:2,status:'closed',created_at:new Date().toISOString(),closed_at:new Date().toISOString(),has_discrepancies:true,ingredients:[plan],events:[],weighings:[{...plan,id:'77777777-7777-4777-8777-777777777777',batch_id:id,actual_quantity:49,difference_quantity:-1,difference_percent:-2,within_tolerance:null,revision:2,incorporated:true,recorded_by:user.id,recorded_at:new Date().toISOString(),incorporated_by:user.id,incorporated_at:new Date().toISOString(),lot:null,expiry_date:null}]}});return;
  }
  if(path.startsWith('/rest/v1/rpc/'))throw new Error('Unexpected extra operation: '+path);
  await route.fulfill({json:[]});
 });
 await page.goto('/');await clickSidebar(page,'Elaboraciones');await page.getByLabel('Receta vigente',{exact:true}).selectOption(recipeId);await page.getByLabel('Responsable de elaboración',{exact:true}).fill('María');await page.getByLabel('Cantidad',{exact:true}).fill('2');await page.getByLabel('Peso real de Harina',{exact:true}).fill('49');await page.getByRole('button',{name:'Guardar y confirmar elaboración',exact:true}).click();await expect(page.getByRole('status')).toContainText('guardada y confirmada');await expect(page.getByRole('article')).toHaveCount(0);await expect(page.getByRole('region',{name:'Historial de elaboraciones',exact:true})).toHaveCount(0);expect(calls).toBe(1);
});
