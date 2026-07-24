// 以 --import 註冊 loader.mjs（Node 內建 module.register），供單元測試載入 route.ts。
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
