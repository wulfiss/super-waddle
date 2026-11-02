import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',testMatch:'**/auth-password.browser.mjs',
 use:{baseURL:'http://127.0.0.1:5174',launchOptions:{...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']}},
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5174',url:'http://127.0.0.1:5174',reuseExistingServer:false,env:{PUBLIC_PREVIEW_MODE:'false',PUBLIC_SUPABASE_URL:'https://auth-fixture.invalid',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_fixture'}},
 projects:[{name:'mobile',use:{viewport:{width:390,height:844}}},{name:'desktop',use:{viewport:{width:1440,height:1000}}}]
});
