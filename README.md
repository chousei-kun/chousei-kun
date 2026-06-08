# 隱ｿ謨ｴ縺上ｓ

Google Calendar 縺ｮ free/busy 繧剃ｽｿ縺｣縺ｦ縲∬､・焚莠ｺ縺ｮ遨ｺ縺肴凾髢灘呵｣懊ｒ蜃ｺ縺吶い繝昴う繝ｳ繝郁ｪｿ謨ｴ繧｢繝励Μ縺ｧ縺吶・
## 縺・∪縺ｮ讒区・

- 繝輔Ο繝ｳ繝医お繝ｳ繝・ `index.html`, `styles.css`, `app.js`
- 繝ｭ繝ｼ繧ｫ繝ｫ髢狗匱繧ｵ繝ｼ繝舌・: `server.mjs`
- GitHub Pages 蜈ｬ髢・ `.github/workflows/pages.yml`
- 險ｭ螳壹ヵ繧｡繧､繝ｫ: `config.js`

## 繝ｭ繝ｼ繧ｫ繝ｫ髢狗匱

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173
```

Check:

```powershell
npm run check
```

## GitHub Pages 遘ｻ陦後Γ繝｢

Netlify credit 縺後↑縺上※繧ゅ√％縺ｮ繝ｪ繝昴ず繝医Μ蜊倅ｽ薙〒 GitHub Pages 縺ｫ蜈ｬ髢九〒縺阪ｋ繧医≧縺ｫ縺励※縺・∪縺吶・
- 迴ｾ蝨ｨ縺ｮ repo 蜷阪・縺ｾ縺ｾ縺ｪ繧牙・髢・URL 縺ｯ `https://chousei-kun.github.io/chousei-kun/`
- `https://chousei-kun.github.io/` 縺ｫ縺励◆縺・ｴ蜷医・縲；itHub Pages 縺ｮ莉墓ｧ倅ｸ翫｛rganization site 逕ｨ縺ｫ `chousei-kun.github.io` 縺ｨ縺・≧ repo 蜷阪′蠢・ｦ√〒縺・
GitHub Pages 縺ｯ髱咏噪繝帙せ繝・ぅ繝ｳ繧ｰ縺ｪ縺ｮ縺ｧ縲¨etlify Functions 縺ｮ繧医≧縺ｪ繧ｵ繝ｼ繝舌・蜃ｦ逅・・菴ｿ縺医∪縺帙ｓ縲ゅ◎縺ｮ縺溘ａ `github.io` 荳翫〒縺ｯ蜈ｱ譛峨Ν繝ｼ繝菫晏ｭ倥ｒ繝悶Λ繧ｦ繧ｶ蜀・Ο繝ｼ繧ｫ繝ｫ菫晏ｭ倥↓蛻・ｊ譖ｿ縺医※縺・∪縺吶・
GitHub Pages 迚医〒縺昴・縺ｾ縺ｾ菴ｿ縺医ｋ繧ゅ・:

- Google OAuth
- Google Calendar free/busy 隱ｭ縺ｿ霎ｼ縺ｿ
- 蛟呵｣懈律譎ゅ・謠先｡・- Google Calendar 縺ｸ縺ｮ莠亥ｮ壻ｽ懈・

GitHub Pages 迚医〒霆ｽ縺上↑繧九ｂ縺ｮ:

- 隍・焚繝ｦ繝ｼ繧ｶ繝ｼ縺ｮ繝ｫ繝ｼ繝閾ｪ蜍暮寔邏・・繝悶Λ繧ｦ繧ｶ蜀・Ο繝ｼ繧ｫ繝ｫ菫晏ｭ倥・縺ｿ
- 蛻･遶ｯ譛ｫ繧・挨繝悶Λ繧ｦ繧ｶ縺ｨ縺ｮ閾ｪ蜍募酔譛溘・縺ｪ縺・
## Runtime config

```js
window.SLOTWISE_CONFIG = {
  googleClientId: "xxxxx.apps.googleusercontent.com",
  roomStore: "local"
};
```

 `googleClientId` は `config.js` に置いておけば、画面には表示されません。`client secret` は入れません。
## 譁ｰ隕城｣謳ｺ縺ｮ騾夂衍繝｡繝ｼ繝ｫ

譁ｰ縺励￥ Google 繧ｫ繝ｬ繝ｳ繝繝ｼ騾｣謳ｺ縺励◆蜿ょ刈閠・′蜃ｺ縺溘→縺阪↓騾夂衍繝｡繝ｼ繝ｫ繧帝√ｊ縺溘＞蝣ｴ蜷医・縲～config.js` 縺ｮ `notificationWebhookUrl` 縺ｫ Webhook URL 繧定ｨｭ螳壹＠縺ｾ縺吶・
```js
window.SLOTWISE_CONFIG = {
  googleClientId: "xxxxx.apps.googleusercontent.com",
  roomStore: "local",
  preferredGoogleAccount: "your-account@gmail.com",
  notificationWebhookUrl: "https://script.google.com/macros/s/your-web-app-id/exec"
};
```

GitHub Pages 縺ｯ髱咏噪繧ｵ繧､繝医↑縺ｮ縺ｧ縲∝ｮ滄圀縺ｮ繝｡繝ｼ繝ｫ騾∽ｿ｡縺ｯ Google Apps Script 縺ｪ縺ｩ螟夜Κ縺ｮ蜿励￠蜿｣縺ｧ陦後＞縺ｾ縺吶・
## GitHub

- Repository: `https://github.com/chousei-kun/chousei-kun`
- Branch: `main`
- Pages workflow: `.github/workflows/pages.yml`

## 繝・・繝ｭ繧､

隧ｳ縺励＞謇矩・・ [DEPLOY.md](C:/Users/Wakua/Documents/Codex/2026-06-07/google-google/DEPLOY.md) 繧定ｦ九※縺上□縺輔＞縲・
