# 貢献ガイド

このリポジトリへの変更は、原則としてブランチを切り、プルリクエスト(PR)経由で行います。
厳守するルールは [CLAUDE.md](CLAUDE.md) を、データモデル・設計は [docs/design.md](docs/design.md) を正としてください。

## 実発言コメント(`data/comments/`)の追加

実在の政治家の国会発言をコメントとして追加する方法は、次の2通りです。

### 方法A: 自分でコメントのYAMLを作成してPRを出す

1. 対象の条文(現行条文、または改憲案が変更・新設・削除する条文)を決める。GitHub Projectの「コメント収集」issue([親issue #16](https://github.com/yadorigi-9-go/japan-constitution-review/issues/16))に未対応の条文が一覧になっている。
2. [国会会議録検索システム](https://kokkai.ndl.go.jp/)で、その条文(または改憲案の該当条文)に具体的に言及している実際の発言を探す。
3. [docs/design.md 5.3節](docs/design.md#53-コメント-datacommentsart-009id-yaml)の形式に従い、`data/comments/<article-id>/c-<発言日>-<発言者のローマ字姓>.yaml` を作成する。
   - `excerpt` は発言の原文のまま、短く(目安120字程度)。要約・言い換えはしない。
   - `summary` は自分の言葉による要約とし、`summary_source: human` にする。
   - 発言が改憲案の条文・文言に明示的に言及している場合のみ `draft_id` を設定する(過大な関連付けを避ける)。
   - 発言者のローマ字表記は、漢字から推測せず、[docs/design.md 5.5節](docs/design.md#55-コメント収集の実務手順検索出典確認)の手順(`speakerYomi` を使う)に従う。
4. `verified: true` として提出する。出典(`source_url`)・日付・引用の正確さは、レビューで確認する。
5. `npm run build` でスキーマ検証とページ生成を確認してからPRを作成する。

### 方法B: 手元のAIアシスタントに下書きを作らせる

自動化されたGitHub Action等は用意していない(方針: [#76](https://github.com/yadorigi-9-go/japan-constitution-review/issues/76)参照)。かわりに、以下のプロンプトを Claude や ChatGPT などの手元のAIアシスタントにそのまま渡し、生成されたYAMLを自分で確認したうえでPRとして提出する。

```text
あなたは日本国憲法レビューサイト(japan-constitution-review)への寄稿を手伝います。
以下の制約を厳守してください。

- 発言・出典・URL・日付を創作しない。確認できない場合は、その旨を報告し、YAMLを生成しない。
- 出典は国会会議録検索システムのAPI(https://kokkai.ndl.go.jp/api/speech)のみとする。
- excerpt は発言の原文のまま一言一句変えずに引用する(要約・言い換え禁止)。長さの目安は120字以内。
- summary は自分の言葉による要約とし、summary_source: ai を明記する。
- 発言者のローマ字表記は、漢字から推測しない。APIレスポンスの speakerYomi(ひらがな)をヘボン式でローマ字化する。
- 発言が改憲案の条文・文言に明示的に言及している場合のみ draft_id を設定する。言及がなければ draft_id: null とする。
- 出力はYAML1件のみとし、説明文は付けない。verified は常に false にする(人間が確認してから true に変更する)。

[スキーマ]
id: c-<発言日 YYYYMMDD>-<発言者のローマ字姓>
article_ids: [<対象の条文id>]
draft_id: <改憲案のdraft-id または null>
kind: speech
claim_type: fact | interpretation | concern | quote
stance: support | oppose | neutral
source_type: primary
speaker:
  name: "<発言者>"
  role: "<肩書き>"
  party: "<会派>"
date: <発言日 YYYY-MM-DD>
venue: "<会議名>"
excerpt: "<原文のまま、短い抜粋>"
summary: "<自分の言葉による要約>"
summary_source: ai
source_url: "https://kokkai.ndl.go.jp/txt/<issueID>/<speechOrder>"
archive_url: ""
accessed_at: <本日の日付>
tags: [<関連キーワード>]
verified: false

[入力]
対象の条文id: <ここに記入>
国会会議録のURL、または issueID と speechOrder: <ここに記入>
```

生成されたYAMLは、出典・引用・`draft_id`の妥当性を自分で照合してから PR に含める。`verified: false` のままではビルド後も画面に表示されない([docs/design.md 5.4節](docs/design.md#54-フィールドの意味))ため、確認が済んだら `verified: true` に変更してから提出する。

### 共通のルール

- 発言・出典・URL・日付を**創作しない**。確認できない場合は、コメントを追加しない(空欄や推測で埋めない)。
- 発言の全文は転載せず、短い抜粋 + 出典リンクにとどめる。
- 実在の政治家に関する記述は、発言内容の事実記述にとどめ、評価語を使わない。
- 特定の政治家の発言をまとめたページは作らない(条文単位で構成する)。
- 賛成・反対どちらか一方の立場に偏らないよう、可能な範囲で両論を探す。

## その他の変更(コード・設計)

コードや `docs/design.md` の変更は、通常どおり変更内容を示したうえでレビューを受けてからマージする。
