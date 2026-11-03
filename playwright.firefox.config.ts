import {defineConfig} from '@playwright/test';
import config from './playwright.config';
export default defineConfig({
 ...config,
 testMatch:'**/order-validation.spec.mjs',
 projects:[
  {name:'firefox-mobile',use:{browserName:'firefox',viewport:{width:390,height:844},launchOptions:{args:[]}}},
  {name:'firefox-desktop',use:{browserName:'firefox',viewport:{width:1440,height:1000},launchOptions:{args:[]}}}
 ]
});
