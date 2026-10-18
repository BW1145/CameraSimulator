import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',timeout:180000,expect:{timeout:30000},workers:1,
  use:{baseURL:process.env.PW_BASE_URL||'http://127.0.0.1:8000',viewport:{width:1440,height:1000},headless:true,channel:process.env.PW_CHANNEL||undefined,launchOptions:{args:process.env.CI?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]}},
  webServer:process.env.PW_BASE_URL?undefined:{command:'npm run preview',url:'http://127.0.0.1:8000',reuseExistingServer:false,timeout:30000},
});
