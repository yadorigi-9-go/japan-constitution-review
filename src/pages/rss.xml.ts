import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { articleLabel } from '../lib/draftDiff';

// 更新履歴(更新が最も多い comments コレクション)を通知する RSS フィード (Issue #50)。
// 条文・改憲案は comments に比べて更新頻度が低いため、まずはコメントのみを配信対象にする。
export async function GET(context: APIContext) {
  const base = import.meta.env.BASE_URL;
  const [comments, draftArticles, draftDeletions] = await Promise.all([
    getCollection('comments'),
    getCollection('draftArticles'),
    getCollection('draftDeletions'),
  ]);

  // verified: false のコメントは公開しない (docs/design.md 10)
  const verifiedComments = comments.filter((comment) => comment.data.verified);

  const draftArticleIds = new Set(draftArticles.map((entry) => entry.id));
  const draftDeletionIdsByDraft = new Map<string, Set<string>>();
  for (const entry of draftDeletions) {
    const [draftId] = entry.id.split('/');
    const set = draftDeletionIdsByDraft.get(draftId) ?? new Set<string>();
    set.add(entry.data.id);
    draftDeletionIdsByDraft.set(draftId, set);
  }

  function articleHref(articleId: string, draftId: string | null): string {
    if (draftId) {
      if (draftArticleIds.has(`${draftId}/${articleId}`)) {
        return `${base}drafts/${draftId}/${articleId}`;
      }
      if (draftDeletionIdsByDraft.get(draftId)?.has(articleId)) {
        return `${base}drafts/${draftId}/deleted/${articleId}`;
      }
    }
    return `${base}articles/${articleId}`;
  }

  const items = verifiedComments
    .map((comment) => {
      const [primaryArticleId] = comment.data.article_ids;
      const labels = comment.data.article_ids.map(articleLabel).join('・');
      return {
        title: `${labels}へのコメント: ${comment.data.speaker.name}`,
        link: articleHref(primaryArticleId, comment.data.draft_id),
        description: comment.data.summary,
        pubDate: comment.data.accessed_at,
      };
    })
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss({
    title: '日本国憲法レビュー',
    description: '日本国憲法と改憲案の論点・リスクを、コードレビュー形式で検証する非公式サイト。',
    // astro.config.mjs で site を設定しているため常に定義されている。
    site: context.site!,
    items,
    customData: '<language>ja</language>',
  });
}
