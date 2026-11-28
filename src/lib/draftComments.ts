// コメントがどのページ(改憲案の条文・削除、現行条文)に表示されるかの判定を一か所にまとめる
// (Issue #220, #229)。改憲案の条文ページ・削除ページ・改憲案の条文一覧の件数・現行条文
// ページ・トップページの件数が、すべて同じ判定を使うことで、一覧の件数と各ページの表示が
// ずれないようにする。
//
// 判定の前提(docs/design.md 5.2, 5.5):
// - verified: false のコメントは公開しない(design.md 10)。
// - 改憲案へのコメント(draft_id あり)は、article_ids にその改憲案の条文idを含む。
//   改番された条文(renamed_from)へのコメントは、改番前・改番後の両方のidを含む(5.5の8)。
// - 新設条文(is_new)・改番後の条文・削除は、番号(id)が現行憲法の無関係な条文や
//   同じ改憲案の別の条文と偶然衝突することがある。
import { getCollection, type CollectionEntry } from 'astro:content';

type Comment = CollectionEntry<'comments'>;
type DraftArticle = CollectionEntry<'draftArticles'>;
type DraftDeletion = CollectionEntry<'draftDeletions'>;

/** 改憲案の条文または削除。現行条文ページとの対応付けに使う。 */
type DraftTarget =
	| { kind: 'article'; draftId: string; entry: DraftArticle }
	| { kind: 'deletion'; draftId: string; entry: DraftDeletion };

function draftIdOf(entry: DraftArticle | DraftDeletion): string {
	// id は "<draftId>/art-XXX" / "<draftId>/del-art-XXX"(src/content.config.ts の generateId)
	return entry.id.split('/')[0];
}

function isRenamed(entry: DraftArticle): boolean {
	return Boolean(entry.data.renamed_from) && entry.data.renamed_from !== entry.data.id;
}

interface Index {
	comments: Comment[];
	draftArticles: DraftArticle[];
	draftDeletions: DraftDeletion[];
	/** draftId → その改憲案の改番された条文 */
	renamedByDraft: Map<string, DraftArticle[]>;
	/** draftId → その改憲案の条文・削除のid(data.id)の集合 */
	targetIdsByDraft: Map<string, Set<string>>;
	targets: DraftTarget[];
}

let indexPromise: Promise<Index> | null = null;

function getIndex(): Promise<Index> {
	if (!indexPromise) {
		indexPromise = Promise.all([
			getCollection('comments'),
			getCollection('draftArticles'),
			getCollection('draftDeletions'),
		]).then(([allComments, draftArticles, draftDeletions]) => {
			const renamedByDraft = new Map<string, DraftArticle[]>();
			for (const entry of draftArticles) {
				if (!isRenamed(entry)) continue;
				const draftId = draftIdOf(entry);
				renamedByDraft.set(draftId, [...(renamedByDraft.get(draftId) ?? []), entry]);
			}
			const targets: DraftTarget[] = [
				...draftArticles.map((entry) => ({ kind: 'article' as const, draftId: draftIdOf(entry), entry })),
				...draftDeletions.map((entry) => ({ kind: 'deletion' as const, draftId: draftIdOf(entry), entry })),
			];
			const targetIdsByDraft = new Map<string, Set<string>>();
			for (const target of targets) {
				const ids = targetIdsByDraft.get(target.draftId) ?? new Set<string>();
				ids.add(target.entry.data.id);
				targetIdsByDraft.set(target.draftId, ids);
			}
			return {
				comments: allComments.filter((comment) => comment.data.verified),
				draftArticles,
				draftDeletions,
				renamedByDraft,
				targetIdsByDraft,
				targets,
			};
		});
	}
	return indexPromise;
}

/** 改憲案の条文 entry へのコメントか。 */
function matchesDraftArticle(comment: Comment, entry: DraftArticle, index: Index): boolean {
	const draftId = draftIdOf(entry);
	const ids = comment.data.article_ids;
	if (comment.data.draft_id !== draftId || !ids.includes(entry.data.id)) return false;
	if (isRenamed(entry)) {
		// 改番された条文へのコメントは、改番前のidも含む(5.5の8)。含まないものは、同じ番号の
		// 別の条文(削除や新設)へのコメント。
		return ids.includes(entry.data.renamed_from!);
	}
	// 改番されていない条文(新設・変更)と同じ番号が、別の条文の改番前の番号になっている場合
	// (例: 現行93条から改番された新94条と、新設の新93条)、その改番条文へのコメントは
	// 改番前の番号(=この条文の番号)も含むため、ここでは除外する。
	const renamed = index.renamedByDraft.get(draftId) ?? [];
	return !renamed.some((r) => r.data.renamed_from === entry.data.id && ids.includes(r.data.id));
}

/** 改憲案の削除 entry へのコメントか。 */
function matchesDraftDeletion(comment: Comment, entry: DraftDeletion, index: Index): boolean {
	const draftId = draftIdOf(entry);
	const ids = comment.data.article_ids;
	if (comment.data.draft_id !== draftId || !ids.includes(entry.data.id)) return false;
	// 削除される条文と同じ番号に、別の現行条文からの改番で条文が来る場合(例: 現行97条の削除と、
	// 現行95条からの改番による新97条)、その改番条文へのコメントは改番前のidも含むため除外する。
	const renamed = index.renamedByDraft.get(draftId) ?? [];
	return !renamed.some((r) => r.data.id === entry.data.id && ids.includes(r.data.renamed_from!));
}

function matchesTarget(comment: Comment, target: DraftTarget, index: Index): boolean {
	return target.kind === 'article'
		? matchesDraftArticle(comment, target.entry, index)
		: matchesDraftDeletion(comment, target.entry, index);
}

/** 改憲案の条文・削除が対応する現行条文のid。新設条文は対応する現行条文がないため null。 */
function currentArticleIdOf(target: DraftTarget): string | null {
	if (target.kind === 'deletion') return target.entry.data.id;
	const { entry } = target;
	if (entry.data.is_new) return null;
	return isRenamed(entry) ? entry.data.renamed_from! : entry.data.id;
}

/** 改憲案の条文ページに表示するコメント(公開済みのみ)。 */
export async function getDraftArticleComments(entry: DraftArticle): Promise<Comment[]> {
	const index = await getIndex();
	return index.comments.filter((comment) => matchesDraftArticle(comment, entry, index));
}

/** 改憲案の削除ページに表示するコメント(公開済みのみ)。 */
export async function getDraftDeletionComments(entry: DraftDeletion): Promise<Comment[]> {
	const index = await getIndex();
	return index.comments.filter((comment) => matchesDraftDeletion(comment, entry, index));
}

/**
 * コメントを表示する現行条文のid。
 * - 現行条文へのコメント(draft_id: null): article_ids のすべて
 * - 改憲案へのコメント: そのコメントが対象とする改憲案の条文・削除が対応する現行条文
 *   (変更=同じid、改番=renamed_from、削除=削除される条文。新設は対応なし)。
 *   article_ids のうち、その改憲案の条文・削除のidに当たらないものは、現行条文を直接
 *   指している(例: 第9条を変更しない jimin-2018 の第9条の2へのコメントで、現行第9条も
 *   併記する場合)とみなし、その現行条文にも表示する。
 */
function currentArticleIdsFor(comment: Comment, index: Index): Set<string> {
	if (!comment.data.draft_id) return new Set(comment.data.article_ids);
	const draftTargetIds = index.targetIdsByDraft.get(comment.data.draft_id) ?? new Set<string>();
	const ids = new Set<string>(comment.data.article_ids.filter((id) => !draftTargetIds.has(id)));
	for (const target of index.targets) {
		if (target.draftId !== comment.data.draft_id) continue;
		if (!comment.data.article_ids.includes(target.entry.data.id)) continue;
		if (!matchesTarget(comment, target, index)) continue;
		const currentId = currentArticleIdOf(target);
		if (currentId) ids.add(currentId);
	}
	return ids;
}

/** 現行条文ページに表示するコメント(公開済みのみ)。 */
export async function getCurrentArticleComments(articleId: string): Promise<Comment[]> {
	const index = await getIndex();
	return index.comments.filter((comment) => currentArticleIdsFor(comment, index).has(articleId));
}

/** 現行条文id → 現行条文ページに表示されるコメント数。 */
export async function getCurrentArticleCommentCounts(): Promise<Map<string, number>> {
	const index = await getIndex();
	const counts = new Map<string, number>();
	for (const comment of index.comments) {
		for (const id of currentArticleIdsFor(comment, index)) {
			counts.set(id, (counts.get(id) ?? 0) + 1);
		}
	}
	return counts;
}

/** 改憲案の条文・削除の entry.id("<draftId>/art-XXX" 等) → 各ページに表示されるコメント数。 */
export async function getDraftCommentCounts(draftId: string): Promise<Map<string, number>> {
	const index = await getIndex();
	const counts = new Map<string, number>();
	for (const target of index.targets) {
		if (target.draftId !== draftId) continue;
		const n = index.comments.filter((comment) => matchesTarget(comment, target, index)).length;
		counts.set(target.entry.id, n);
	}
	return counts;
}
