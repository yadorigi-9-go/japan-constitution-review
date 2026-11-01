# japan-constitution-review

日本国憲法と改憲案の論点・リスクを、コードレビュー形式で検証する静的サイト。

日本国憲法を「コードベース」、改憲案を「プルリクエスト」に見立て、現行憲法の仕組み・改憲案が加える権限・外れる歯止め・改憲した場合と現状維持した場合のリスクを、条文単位で並べて表示します。

設計の詳細・データモデル・方針は [docs/design.md](docs/design.md) を正とします。本READMEはセットアップとコマンドの手引きです。

## 技術スタック

- フレームワーク: [Astro](https://astro.build/) + TypeScript
- データ取得: Python (`scripts/`)
- 検索: [Pagefind](https://pagefind.app/)
- ホスティング: GitHub Pages

## セットアップ

```bash
npm install
```

## コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバーを起動 |
| `npm run build` | 本番ビルド(型・スキーマ検証を兼ねる)+ Pagefind の索引を生成 |
| `npm run preview` | ビルド済みの `dist/` をローカルで確認(検索機能の動作確認にはこちらを使う) |
| `npm run fetch:articles` | e-Gov 法令API から現行憲法の条文を取得し `data/articles/` を再生成 |
| `npm run check:links` | `data/` 以下の `source_url` / `archive_url` のリンク切れを確認 |

## リポジトリ構成

```plaintext
data/
├── articles/   # 現行憲法の条文(人が確認済み)
├── drafts/     # 改憲案(案ごとにディレクトリ)
└── comments/   # 発言・論点レビュー(条文単位)
scripts/        # Python: データ取得・検証
src/
├── pages/      # 条文ページ、改憲案ページ
├── components/ # UI部品
└── lib/        # データ読み込み・diff生成
docs/
└── design.md   # 設計資料(正)
```

## 厳守する方針(抜粋)

- 発言・出典・URL・日付を創作しない。確認できないものは空欄か `verified: false` にする
- 未確認(`verified: false`)のコメントは公開しない
- 特定の政治家の発言をまとめたページは作らない(条文単位で構成する)
- 実在の政治家に関する記述は、発言内容の事実記述にとどめ、評価語を使わない

詳細は [docs/design.md](docs/design.md) の「厳守するルール」「出典・著作権・利用規約の方針」を参照してください。

## 貢献

実発言コメントの追加方法などは [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## ステータス

設計・実装の進行中です。ロードマップと未決事項は [docs/design.md](docs/design.md#12-ロードマップ) を参照してください。

## ライセンス

- ソースコード: MIT License
- 条文・会議録など第三者提供データ: 各提供元の利用条件に従う
