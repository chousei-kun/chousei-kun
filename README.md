# 調整くん

Google Calendar の free/busy を使って、複数人の空き時間候補を出すアポイント調整アプリです。

## いまの構成

- フロントエンド: `index.html`, `styles.css`, `app.js`
- ローカル開発サーバー: `server.mjs`
- GitHub Pages 公開: `.github/workflows/pages.yml`
- 設定ファイル: `config.js`

## ローカル開発

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

## GitHub Pages 移行メモ

Netlify credit がなくても、このリポジトリ単体で GitHub Pages に公開できるようにしています。

- 現在の repo 名のままなら公開 URL は `https://chousei-kun.github.io/chousei-kun/`
- `https://chousei-kun.github.io/` にしたい場合は、GitHub Pages の仕様上、organization site 用に `chousei-kun.github.io` という repo 名が必要です

GitHub Pages は静的ホスティングなので、Netlify Functions のようなサーバー処理は使えません。そのため `github.io` 上では共有ルーム保存をブラウザ内ローカル保存に切り替えています。

GitHub Pages 版でそのまま使えるもの:

- Google OAuth
- Google Calendar free/busy 読み込み
- 候補日時の提案
- Google Calendar への予定作成

GitHub Pages 版で軽くなるもの:

- 複数ユーザーのルーム自動集約はブラウザ内ローカル保存のみ
- 別端末や別ブラウザとの自動同期はなし

## Runtime config

```js
window.SLOTWISE_CONFIG = {
  googleClientId: "xxxxx.apps.googleusercontent.com",
  roomStore: "local",
  roomApiUrl: ""
};
```

`googleClientId` は公開識別子なので `config.js` に置いて問題ありません。`client secret` は入れません。

## 新規連携の通知メール

新しく Google カレンダー連携した参加者が出たときに通知メールを送りたい場合は、`config.js` の `notificationWebhookUrl` に Webhook URL を設定します。

```js
window.SLOTWISE_CONFIG = {
  googleClientId: "xxxxx.apps.googleusercontent.com",
  roomStore: "local",
  roomApiUrl: "",
  preferredGoogleAccount: "your-account@gmail.com",
  notificationWebhookUrl: "https://script.google.com/macros/s/your-web-app-id/exec"
};
```

GitHub Pages は静的サイトなので、実際のメール送信は Google Apps Script など外部の受け口で行います。

## GitHub

- Repository: `https://github.com/chousei-kun/chousei-kun`
- Branch: `main`
- Pages workflow: `.github/workflows/pages.yml`

## デプロイ

詳しい手順は [DEPLOY.md](C:/Users/Wakua/Documents/Codex/2026-06-07/google-google/DEPLOY.md) を見てください。
