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
    // art-XXX.yaml (条文) のほか、前文の改正案は preamble.yaml として扱う。
    pattern: '*/{art-*,preamble}.yaml',
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
    // この条文の変更内容を要約した短いタイトル(Issue風の一覧・見出しに使う)。評価語は使わず、
    // 何が変わったかを事実として記述する(例: "戦力不保持規定の削除")。
    title: z.string(),
    // 現行条文との対応が本当にない(真に新設)かどうかを明示する。
    // 新設章の挿入等により、この draft 条文の id (番号) と同じ番号の“別内容”の
    // 現行条文がたまたま存在することがある(例: 新設の draft art-098「緊急事態の宣言」
    // に対し、現行 art-098 は無関係な「基本的人権の本質」)。is_new: true の場合は
    // id が現行条文と衝突していても一切比較しない。
    is_new: z.boolean(),
    // 他章の新設等により条番号がずれた場合、改番前(現行)の条文idを指定する。
    // 例: 現行 art-096 が新設章の挿入により draft 側で art-100 に移った場合、
    //     id: art-100, renamed_from: art-096。diff は renamed_from 側の現行条文と比較する。
    // is_new: false で、条番号が変わらない通常の改正では null のままでよい。
    // is_new: true のときは無視される。
    renamed_from: z.string().nullable(),
    // 前文(id: "preamble")は章・条文番号を持たないため省略する(5.1 の前文スキーマに合わせる)。
    chapter: z.string().optional(),
    number: z.number().optional(),
    paragraphs: z.array(
      z.object({
        no: z.number(),
        // この項が、現行条文のどの項(no)をベースにしているかを示す。
        // 省略時はこの項自身の no と同じとみなす(項の挿入・並べ替えがない通常のケース)。
        // 現行に対応する項がない(新設の項)場合は null を明示する。
        // 項の挿入・並べ替えがあるときに、項番号のずれで誤った項同士を比較しないための指定。
        based_on: z.number().nullable().optional(),
        text: z.string(),
      }),
    ),
    source_url: z.string().url(),
    retrieved_at: z.coerce.date(),
  }),
});

// data/drafts/<draft-id>/del-<article-id>.yaml のスキーマ (docs/design.md 5.2)
// 草案で現行条文がまるごと削除される場合に使う(例: 現行第97条「基本的人権の永久性」の削除)。
// draftArticles と違い、削除後の新しい条文本文は存在しないため、paragraphs は持たない。
// 画面では、id が指す現行条文(data/articles/)の本文全体を取消線付きで表示する。
const draftDeletions = defineCollection({
  loader: glob({
    pattern: '*/del-*.yaml',
    base: new URL('../data/drafts', import.meta.url),
    // コレクションの id は "<draft-id>/del-<article-id>"。data.id は削除される現行条文の id。
    generateId: ({ entry, data }) => {
      const filename = entry.split('/').pop() ?? entry;
      const expected = filename.replace(/^del-/, '').replace(/\.ya?ml$/i, '');
      const actual = typeof data.id === 'string' ? data.id : undefined;
      if (!actual) {
        throw new Error(`data/drafts/${entry}: id フィールドが文字列で指定されていません`);
      }
      if (actual !== expected) {
        throw new Error(
          `data/drafts/${entry}: ファイル名 "del-${expected}" と data.id "${actual}" が一致しません。`,
        );
      }
      return entry.replace(/\.ya?ml$/i, '');
    },
  }),
  schema: z.object({
    id: z.string(),
    // 削除内容を要約した短いタイトル(例: "基本的人権の永久性規定の削除")。
    title: z.string(),
    source_url: z.string().url(),
    retrieved_at: z.coerce.date(),
  }),
});

export const collections = { articles, comments, drafts, draftArticles, draftDeletions };
