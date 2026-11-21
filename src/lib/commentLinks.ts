import { getCollection, type CollectionEntry } from 'astro:content';
import { articleLabel } from './draftDiff';

interface CommentTarget {
	href: string;
	label: string;
}

interface DraftEntryInfo {
	draftName: string;
	title: string;
}

let indexPromise: Promise<{
	draftArticleMap: Map<string, DraftEntryInfo>;
	draftDeletionMap: Map<string, DraftEntryInfo>;
}> | null = null;

function getIndex() {
	if (!indexPromise) {
		indexPromise = Promise.all([
			getCollection('drafts'),
			getCollection('draftArticles'),
			getCollection('draftDeletions'),
		]).then(([drafts, draftArticles, draftDeletions]) => {
			const draftNameById = new Map(drafts.map((d) => [d.id, d.data.name]));
			const draftArticleMap = new Map(
				draftArticles.map((entry) => {
					const draftId = entry.id.split('/')[0];
					return [entry.id, { draftName: draftNameById.get(draftId) ?? draftId, title: entry.data.title }];
				}),
			);
			const draftDeletionMap = new Map(
				draftDeletions.map((entry) => {
					const draftId = entry.id.split('/')[0];
					return [`${draftId}/${entry.data.id}`, { draftName: draftNameById.get(draftId) ?? draftId, title: entry.data.title }];
				}),
			);
			return { draftArticleMap, draftDeletionMap };
		});
	}
	return indexPromise;
}

// コメントが表示されている条文(現行条文、または改憲案の条文)へのリンクを1件返す。
// article_ids に改番前・改番後など複数idが含まれる場合は、draft_id と一致する
// 最初のものを優先する(docs/design.md 5.5節8)。
export async function resolveCommentTarget(comment: CollectionEntry<'comments'>, base: string): Promise<CommentTarget> {
	const { draftArticleMap, draftDeletionMap } = await getIndex();
	const draftId = comment.data.draft_id;
	if (draftId) {
		for (const articleId of comment.data.article_ids) {
			const key = `${draftId}/${articleId}`;
			const draftArticle = draftArticleMap.get(key);
			if (draftArticle) {
				return { href: `${base}drafts/${draftId}/${articleId}`, label: `${draftArticle.draftName} ${draftArticle.title}` };
			}
			const draftDeletion = draftDeletionMap.get(key);
			if (draftDeletion) {
				return { href: `${base}drafts/${draftId}/deleted/${articleId}`, label: `${draftDeletion.draftName} ${draftDeletion.title}` };
			}
		}
	}
	const articleId = comment.data.article_ids[0];
	return { href: `${base}articles/${articleId}`, label: articleLabel(articleId) };
}
