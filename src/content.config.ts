import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// data/articles/*.yaml のスキーマ (docs/design.md 5.1)
const articles = defineCollection({
  loader: glob({
    pattern: '**/*.yaml',
    base: new URL('../data/articles', import.meta.url),
    // コレクションの id は data.id を使う。id は常にファイル名(拡張子なし)と
    // 完全一致させる(ゼロ埋めする)ことで、文字列ソート=数値順になるようにする。
    // 例: ファイル名 art-009.yaml なら id も "art-009"。
    generateId: ({ entry, data }) => {
      const expected = entry.replace(/\.ya?ml$/i, '');
      const actual = typeof data.id === 'string' ? data.id : undefined;
      if (!actual) {
        throw new Error(`data/articles/${entry}: id フィールドが文字列で指定されていません`);
      }
      if (actual !== expected) {
        throw new Error(
          `data/articles/${entry}: ファイル名 "${expected}" と data.id "${actual}" が一致しません。` +
            'id はファイル名と同じ形式(条文番号をゼロ埋めした art-009 の形)にしてください。',
        );
      }
      return actual;
    },
  }),
  schema: z.discriminatedUnion('kind', [
    // 通常の条文 (第一条〜第百三条)
    z.object({
      kind: z.literal('article'),
      id: z.string(),
      chapter: z.string(),
      number: z.number(),
      paragraphs: z.array(
        z.object({
          no: z.number(),
          text: z.string(),
        }),
      ),
      source_url: z.string().url(),
      retrieved_at: z.coerce.date(),
    }),
    // 前文。章・条文番号を持たない
    z.object({
      kind: z.literal('preamble'),
      id: z.string(),
      paragraphs: z.array(
        z.object({
          no: z.number(),
          text: z.string(),
        }),
      ),
      source_url: z.string().url(),
      retrieved_at: z.coerce.date(),
    }),
  ]),
});

// data/comments/<article-id>/<comment-id>.yaml のスキーマ (docs/design.md 5.3)
// verified: false のコメントは公開しない(docs/design.md 10)。読み込み側でフィルタする。
const comments = defineCollection({
  loader: glob({
    pattern: '**/*.yaml',
    base: new URL('../data/comments', import.meta.url),
  }),
  schema: z.object({
    id: z.string(),
    article_ids: z.array(z.string()),
    draft_id: z.string().nullable(),
    kind: z.enum(['speech', 'review', 'embed']),
    claim_type: z.enum(['fact', 'interpretation', 'concern', 'quote']),
    stance: z.enum(['support', 'oppose', 'neutral']),
    source_type: z.enum(['primary', 'news', 'organization']),
    speaker: z.object({
      name: z.string(),
      role: z.string(),
      party: z.string(),
    }),
    date: z.coerce.date(),
    venue: z.string(),
    excerpt: z.string(),
    summary: z.string(),
    // summary (自分の言葉による要約) を書いたのが人かAIかを明示する。画面上にも表示する。
    summary_source: z.enum(['human', 'ai']),
    // 未確認の場合は空欄にする運用のため、URL形式を強制しない。
    source_url: z.string(),
    archive_url: z.string(),
    accessed_at: z.coerce.date(),
    tags: z.array(z.string()),
    verified: z.boolean(),
  }),
});

// data/drafts/<draft-id>/meta.yaml のスキーマ (docs/design.md 5.2)
const drafts = defineCollection({
  loader: glob({
    pattern: '*/meta.yaml',
    base: new URL('../data/drafts', import.meta.url),
    // コレクションの id は draft-id (ディレクトリ名)。data.id と一致させる。
    generateId: ({ entry, data }) => {
      const expected = entry.split('/')[0];
      const actual = typeof data.id === 'string' ? data.id : undefined;
      if (!actual) {
        throw new Error(`data/drafts/${entry}: id フィールドが文字列で指定されていません`);
      }
      if (actual !== expected) {
        throw new Error(
          `data/drafts/${entry}: ディレクトリ名 "${expected}" と id "${actual}" が一致しません。`,
        );
      }
      return actual;
    },
  }),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    proposer: z.string(),
    published_at: z.coerce.date(),
    source_url: z.string().url(),
    retrieved_at: z.coerce.date(),
  }),
});

// data/drafts/<draft-id>/art-XXX.yaml のスキーマ (docs/design.md 5.2)
// 変更・新設された条文のみを、変更後の条文として格納する(現行条文との diff はビルド時に生成)。
const draftArticles = defineCollection({
  loader: glob({
    pattern: '*/art-*.yaml',
    base: new URL('../data/drafts', import.meta.url),
    // コレクションの id は "<draft-id>/<article-id>"。data.id (ファイル名) は
    // 対象の条文 id (data/articles/ 側の id、または art-009-2 のような新設条文の枝番id)。
    generateId: ({ entry, data }) => {
      const filename = entry.split('/').pop() ?? entry;
      const expected = filename.replace(/\.ya?ml$/i, '');
      const actual = typeof data.id === 'string' ? data.id : undefined;
      if (!actual) {
        throw new Error(`data/drafts/${entry}: id フィールドが文字列で指定されていません`);
      }
      if (actual !== expected) {
        throw new Error(
          `data/drafts/${entry}: ファイル名 "${expected}" と data.id "${actual}" が一致しません。`,
        );
      }
      return entry.replace(/\.ya?ml$/i, '');
    },
  }),
  schema: z.object({
    id: z.string(),
    chapter: z.string(),
    number: z.number(),
    paragraphs: z.array(
      z.object({
        no: z.number(),
        text: z.string(),
      }),
    ),
    source_url: z.string().url(),
    retrieved_at: z.coerce.date(),
  }),
});

export const collections = { articles, comments, drafts, draftArticles };
