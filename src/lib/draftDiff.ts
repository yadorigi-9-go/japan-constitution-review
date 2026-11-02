import { getEntry, type CollectionEntry } from 'astro:content';
import { diffChars } from 'diff';

export function articleLabel(id: string): string {
  if (id === 'preamble') return '前文';
  const m = id.match(/^art-(\d+)(?:-(\d+))?$/);
  if (!m) return id;
  const num = Number(m[1]);
  return m[2] ? `第${num}条の${Number(m[2])}` : `第${num}条`;
}

export async function computeDraftArticleDiff(entry: CollectionEntry<'draftArticles'>) {
  // is_new: true の場合は、id が現行条文と番号が衝突していても一切比較しない
  // (新設章の挿入で、無関係な現行条文と番号が偶然重なることがあるため)。
  // renamed_from があれば、条番号が変わった既存条文として扱い、renamed_from 側の
  // 現行条文と比較する。
  const lookupId = entry.data.is_new ? null : (entry.data.renamed_from ?? entry.data.id);
  const current = lookupId ? await getEntry('articles', lookupId) : undefined;
  const isRenamed = Boolean(entry.data.renamed_from) && entry.data.renamed_from !== entry.data.id;
  // 通常の条文(kind: article)のほか、前文(kind: preamble)も比較対象になる。どちらも
  // paragraphs の形が同じなので、同じロジックで diff できる。
  const isComparable = Boolean(current) && (current!.data.kind === 'article' || current!.data.kind === 'preamble');
  const isNew = entry.data.is_new || !isComparable;
  const oldParagraphs = !isNew && isComparable ? current!.data.paragraphs : [];
  const newParagraphs = entry.data.paragraphs;

  // 各新項の based_on (省略時は自分の no) が示す現行項とだけ比較する。項の挿入・
  // 並べ替えがあっても、項番号のずれで無関係な項同士を比較しないようにするため。
  const usedOldNos = new Set(
    newParagraphs.map((p) => (p.based_on === undefined ? p.no : p.based_on)).filter((n): n is number => n !== null),
  );
  const paragraphDiffs = newParagraphs.map((p) => {
    const basedOn = p.based_on === undefined ? p.no : p.based_on;
    const oldText = basedOn !== null ? (oldParagraphs.find((op) => op.no === basedOn)?.text ?? '') : '';
    return { no: p.no, basedOn, parts: diffChars(oldText, p.text) };
  });
  // 新条文側のどの項からも参照されなかった現行項は、純粋な削除として表示する。GitHub の
  // diff 表示(削除行が先、追加・変更行が後)に合わせ、末尾に追加するのではなく、
  // 現行の項番号(basedOn)順で正しい位置に挿入する。末尾に追加すると、後続の項が
  // 既に表示された後に削除が出てきて、表示順が現行条文の項番号と食い違ってしまうため。
  for (const op of oldParagraphs) {
    if (!usedOldNos.has(op.no)) {
      const deletionRow = { no: op.no, basedOn: op.no, parts: diffChars(op.text, '') };
      const insertAt = paragraphDiffs.findIndex((row) => row.basedOn !== null && row.basedOn > op.no);
      if (insertAt === -1) {
        paragraphDiffs.push(deletionRow);
      } else {
        paragraphDiffs.splice(insertAt, 0, deletionRow);
      }
    }
  }

  return {
    id: entry.data.id,
    title: entry.data.title,
    renamedFrom: entry.data.renamed_from,
    isRenamed,
    isNew,
    paragraphDiffs: paragraphDiffs.map(({ no, parts }) => ({ no, parts })),
  };
}
