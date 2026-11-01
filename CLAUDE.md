# japan-constitution-review

日本国憲法と改憲案の論点・リスクを、コードレビュー形式で検証する静的サイト。
設計は @docs/design.md を正とする。

## 技術

- Astro + TypeScript、データ取得は Python(scripts/)
- GitHub Pages で公開(astro.config.mjs の base に注意)
- シェルスクリプトは bash 互換で書き、先頭に `#!/usr/bin/env bash` を付ける
- コマンドは npm scripts 経由で呼べるようにする

## コマンド

- 開発: npm run dev / ビルド: npm run build
- データ検証: (スクリプト作成後に追記)

## 厳守するルール

- 発言・出典・URL・日付を**創作しない**。確認できないものは空欄か `verified: false` にする
- サンプルデータは架空であることを明記する
- 実在の政治家に関する記述は、発言内容の事実記述にとどめ、評価語を使わない
- コメントは短い抜粋+出典リンク。全文転載しない
- 特定の政治家の発言をまとめたページは作らない(条文単位で構成)
- 映像は転載せず、埋め込みかリンクにする
- commit と push は、内容を見せて私が承認してから行う
  - 例外: 実発言コメント収集タスク(`data/comments/` への追加)は、内容をチャットで提示すれば、承認を待たずに branch 作成〜commit〜push〜PR作成まで自動で進めてよい(2026-11-01)
- 秘密鍵・認証情報・`data/raw/` はコミットしない
