# FORSAKEN-LIKE

Forsaken風の非対称3Dオンラインゲーム (1キラー vs サバイバー)。Node.js + WebSocket(`ws`) + Three.js。判定はすべてサーバー側。

## ルール
- 2人以上で自動開始。ランダムで1人がキラー、残りがサバイバー
- サバイバー: 発電機を4台直す(Eを長押し) → 出口が開く → 脱出
- キラー: クリックで近接攻撃(3発で撃破)。全員を倒せば勝利
- 7分で時間切れ=キラー勝利

操作: WASD移動 / Shiftダッシュ(スタミナ制) / E修理 / クリック攻撃 / マウス視点

## ローカル起動
```
npm install
npm start   # http://localhost:3000
```

## GitHubに上げる
```
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/<あなた>/<リポジトリ名>.git
git push -u origin main
```

## Renderにデプロイ
1. https://render.com にログイン → **New + → Blueprint** (または Web Service)
2. GitHubリポジトリを選択。`render.yaml` が自動で読み込まれます
3. Web Serviceで手動設定する場合: Build `npm install` / Start `npm start`
4. 発行されたURLを複数人で開けば遊べます (WebSocketは同一URLで自動接続)

※ Freeプランは無操作で停止するため、最初のアクセスに数十秒かかります。
