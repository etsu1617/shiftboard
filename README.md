# 📅 ShiftBoard - セットアップガイド

シフト管理Webアプリです。Supabase（DB・認証）+ Gmail API（メール通知）で動作します。

---

## 📁 ファイル構成

```
shiftboard/
├── index.html          ← メインのWebページ（これをブラウザで開く）
├── style.css           ← デザイン
├── app.js              ← フロントエンドのロジック
├── config.js           ← SupabaseのURLとキー（あなたの情報に変更）
├── supabase-schema.sql ← DBのテーブル定義（Supabaseで実行）
├── gmail-server.js     ← メール送信バックエンド（Renderにデプロイ）
├── package.json        ← Node.jsの依存関係
├── .env.example        ← 環境変数のテンプレート
└── README.md           ← このファイル
```

---

## 🚀 セットアップ手順

### ステップ1：Supabase の設定

1. [https://supabase.com](https://supabase.com) で無料アカウントを作成
2. 新しいプロジェクトを作成
3. 左メニューの「SQL Editor」を開く
4. `supabase-schema.sql` の内容を貼り付けて「Run」を押す
5. 左メニューの「Settings → API」を開き、以下をメモする
   - **Project URL**（例: `https://xxxx.supabase.co`）
   - **anon public key**（長い文字列）

### ステップ2：config.js の編集

`config.js` を開いて、メモした値を入力する：

```javascript
const CONFIG = {
  SUPABASE_URL: 'https://あなたのURL.supabase.co',
  SUPABASE_ANON_KEY: 'あなたのanonキー',
  BACKEND_URL: 'https://あなたのアプリ.onrender.com',  // 後で設定
};
```

### ステップ3：Gmail API の設定

メール通知を使う場合のみ必要です。

1. [Google Cloud Console](https://console.cloud.google.com) でプロジェクトを作成
2. 「APIとサービス → ライブラリ」で **Gmail API** を有効化
3. 「APIとサービス → 認証情報」で **OAuthクライアントID** を作成
   - アプリの種類: **ウェブアプリケーション**
   - リダイレクトURI: `https://developers.google.com/oauthplayground`
4. クライアントID・シークレットをメモ
5. [OAuth Playground](https://developers.google.com/oauthplayground) でリフレッシュトークンを取得
   - 右上の歯車 → 「Use your own OAuth credentials」にチェックし、クライアントIDとシークレットを入力
   - スコープ: `https://mail.google.com/` を選択して認証
   - Step 2 で「Exchange authorization code for tokens」→ `refresh_token` をメモ

### ステップ4：バックエンドを Render にデプロイ

1. GitHubにリポジトリを作成し、このフォルダのファイルをプッシュ
2. [https://render.com](https://render.com) で無料アカウントを作成
3. 「New Web Service」でGitHubリポジトリを選択
4. 設定：
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. 「Environment Variables」で `.env.example` の内容を設定
6. デプロイ後のURL（例: `https://shiftboard-xxxx.onrender.com`）をメモ

### ステップ5：config.js の BACKEND_URL を更新

ステップ6でメモしたRenderのURLを `config.js` の `BACKEND_URL` に設定する。

### ステップ6：Netlify にフロントをデプロイ

1. [https://netlify.com](https://netlify.com) で無料アカウントを作成
2. `index.html`, `style.css`, `app.js`, `config.js` をドラッグ&ドロップでデプロイ
3. URLが発行されれば完成！

---

## 👤 最初のホストアカウントの作り方

1. アプリを開いて「新規登録」
2. 役割を「管理者（ホスト）」にして登録
3. Supabaseの「Authentication → Users」でメール確認を手動で済ませる（開発中は Settings → Auth → Email confirmation をオフにしておくと楽）

---

## ❓ よくある質問

**Q: メールが届かない**
→ バックエンドが起動しているか確認。Renderの無料プランは15分使わないとスリープするため、最初のリクエストに時間がかかることがあります。

**Q: ログインできない**
→ Supabaseのメール確認設定を確認してください。開発中は Authentication → Settings → Email confirmation を無効にすると便利です。

**Q: シフトが表示されない**
→ まずホストでログインして「✏️ シフトを設定する」からメンバーのシフトを登録してください。

---

## 📞 データベース構造（シフトのJSON形式）

`shift_schedule` は以下のJSON形式で保存されます：

```json
{
  "0": null,                              ← 日曜：出勤なし
  "1": { "start": "09:00", "end": "17:00" }, ← 月曜
  "2": { "start": "13:00", "end": "21:00" }, ← 火曜
  "3": null,
  "4": { "start": "09:00", "end": "17:00" }, ← 木曜
  "5": { "start": "09:00", "end": "17:00" }, ← 金曜
  "6": null                               ← 土曜：出勤なし
}
```

キーは曜日（0=日、1=月 ... 6=土）です。
