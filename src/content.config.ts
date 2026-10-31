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
    // 未確認の場合は空欄にする運用のため、URL形式を強制しない。
    source_url: z.string(),
    archive_url: z.string(),
    accessed_at: z.coerce.date(),
    tags: z.array(z.string()),
    verified: z.boolean(),
  }),
});

export const collections = { articles, comments };
