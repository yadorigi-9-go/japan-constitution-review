import { getCollection } from 'astro:content';

// 本文中の「第96条」「九十六条」「第9条の2」のような条文番号表記を、
// 該当する条文ページへのリンクに変換する(GitHub Issue #86)。

const KANJI_DIGIT: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const KANJI_UNIT: Record<string, number> = { 十: 10, 百: 100 };

// 漢数字(例: "九十六" → 96、"百三" → 103)を数値に変換する。1〜999 を想定
// (現行憲法・改憲案の条文番号の範囲を十分にカバーする)。不正な文字列は null。
function kanjiToNumber(kanji: string): number | null {
  let total = 0;
  let current = 0;
  let matchedAny = false;
  for (const ch of kanji) {
    if (ch in KANJI_DIGIT) {
      current = KANJI_DIGIT[ch];
      matchedAny = true;
    } else if (ch in KANJI_UNIT) {
      total += (current || 1) * KANJI_UNIT[ch];
      current = 0;
      matchedAny = true;
    } else {
      return null;
    }
  }
  total += current;
  return matchedAny && total > 0 ? total : null;
}

function parseNumber(raw: string): number | null {
  if (/^[0-9]+$/.test(raw)) return Number(raw);
  return kanjiToNumber(raw);
}

function buildArticleId(number: number, branch: number | null): string {
  const base = `art-${String(number).padStart(3, '0')}`;
  return branch ? `${base}-${branch}` : base;
}

const ARTICLE_REF_PATTERN = /第([一二三四五六七八九十百0-9]+)条(?:の([一二三四五六七八九十0-9]+))?/g;

const HTML_ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch]);
}

interface ArticleIndex {
  articleIds: Set<string>;
  draftArticleIds: Set<string>; // "<draftId>/<articleId>"
  draftDeletionIds: Set<string>; // "<draftId>/<articleId>" (削除される現行条文側のid)
}

let indexPromise: Promise<ArticleIndex> | null = null;
function getIndex(): Promise<ArticleIndex> {
  if (!indexPromise) {
    indexPromise = Promise.all([
      getCollection('articles'),
      getCollection('draftArticles'),
      getCollection('draftDeletions'),
    ]).then(([articles, draftArticles, draftDeletions]) => ({
      articleIds: new Set(articles.map((a) => a.id)),
      draftArticleIds: new Set(draftArticles.map((e) => e.id)),
      draftDeletionIds: new Set(
        draftDeletions.map((e) => `${e.id.split('/')[0]}/${e.data.id}`),
      ),
    }));
  }
  return indexPromise;
}

/**
 * text 中の条文番号表記をリンク化した HTML 文字列を返す。
 * draftId が指定され、その改憲案がその条文を変更・新設・削除している場合は
 * 改憲案側のページへ、そうでなければ現行条文ページ(存在する場合のみ)へリンクする。
 * 該当する条文ページが存在しない場合は、プレーンテキストのまま残す
 * (リンク切れを作らないため)。
 */
// この語がマッチ直前(数文字以内)にある場合は、コメントの draft_id に関わらず
// 現行条文への言及とみなす(例: 「自民党草案第6条」の後に続く「現憲法第七条」は、
// draft_id が設定されていても現行条文を指しているため)。
const CURRENT_LAW_CUE_PATTERN = /(現行|現憲法|現在の)\s*$/;
const CUE_LOOKBEHIND_CHARS = 6;

// 同じ番号が削除条文と新設条文の両方に使われている場合(例: jimin-2012のart-097。
// 現行第97条の削除と、別の条文の改番による新しい第97条が番号上たまたま重なる)、
// 前後に「削除」があれば削除条文への言及とみなす。
const DELETION_CUE_PATTERN = /削除/;
const CUE_CONTEXT_CHARS = 15;

export async function linkifyArticleRefs(text: string, draftId: string | null, base: string): Promise<string> {
  const { articleIds, draftArticleIds, draftDeletionIds } = await getIndex();
  const escaped = escapeHtml(text);

  return escaped.replace(ARTICLE_REF_PATTERN, (match, numRaw: string, branchRaw: string | undefined, offset: number, full: string) => {
    const number = parseNumber(numRaw);
    if (number === null) return match;
    const branch = branchRaw !== undefined ? parseNumber(branchRaw) : null;
    if (branchRaw !== undefined && branch === null) return match;

    const articleId = buildArticleId(number, branch);
    const precedingText = full.slice(Math.max(0, offset - CUE_LOOKBEHIND_CHARS), offset);
    const refersToCurrentLaw = CURRENT_LAW_CUE_PATTERN.test(precedingText);

    const isDraftArticle = Boolean(draftId) && draftArticleIds.has(`${draftId}/${articleId}`);
    const isDraftDeletion = Boolean(draftId) && draftDeletionIds.has(`${draftId}/${articleId}`);
    let preferDeletion = false;
    if (isDraftArticle && isDraftDeletion) {
      const context = full.slice(Math.max(0, offset - CUE_CONTEXT_CHARS), offset + match.length + CUE_CONTEXT_CHARS);
      preferDeletion = DELETION_CUE_PATTERN.test(context);
    }

    let href: string | null = null;
    if (!refersToCurrentLaw && isDraftArticle && !preferDeletion) {
      href = `${base}drafts/${draftId}/${articleId}`;
    } else if (!refersToCurrentLaw && isDraftDeletion) {
      href = `${base}drafts/${draftId}/deleted/${articleId}`;
    } else if (articleIds.has(articleId)) {
      href = `${base}articles/${articleId}`;
    }

    return href ? `<a href="${href}">${match}</a>` : match;
  });
}
