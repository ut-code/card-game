# card-game

## 環境構築

```bash
git clone git@github.com:ut-code/card-game.git
cd card-game
bun install 
```

## 開発環境

```bash
# 一つのターミナルでやる
bun dev

# 別々のターミナルで開いてやる
bun dev:frontend
bun dev:backend
```

必要な環境変数は `.env` で設定

## デプロイ

```bash
# 継続的デプロイ以外でローカルのコードをデプロイしたいとき
bun run deploy
```
## 使用技術

### 開発
- Bun
- Biome

### フロントエンド
- React Router v7 (Framework mode)
- Tailwind CSS
- Daisy UI

### バックエンド
- Hono
- Drizzle ORM
- Supabase
- Cloudflare Workers
- Cloudflare Durable Objects