import { getEntry, type CollectionEntry } from 'astro:content';
import { diffChars } from 'diff';

export function articleLabel(id: string): string {
  const m = id.match(/^art-(\d+)(?:-(\d+))?$/);
  if (!m) return id;
  const num = Number(m[1]);
  return m[2] ? `第${num}条の${Number(m[2])}` : `第${num}条`;
}

export async function computeDraftArticleDiff(entry: CollectionEntry<'draftArticles'>) {
  // renamed_from があれば、新設ではなく条番号が変わった既存条文として扱い、
  // diff は renamed_from 側の現行条文と比較する。
  const lookupId = entry.data.renamed_from ?? entry.data.id;
  const current = await getEntry('articles', lookupId);
  const isRenamed = Boolean(entry.data.renamed_from) && entry.data.renamed_from !== entry.data.id;
  const isNew = !current || current.data.kind !== 'article';
  const oldParagraphs = !isNew && current && current.data.kind === 'article' ? current.data.paragraphs : [];
  const newParagraphs = entry.data.paragraphs;

  const paragraphNos = [...new Set([...oldParagraphs, ...newParagraphs].map((p) => p.no))].sort((a, b) => a - b);
  const paragraphDiffs = paragraphNos.map((no) => {
    const oldText = oldParagraphs.find((p) => p.no === no)?.text ?? '';
    const newText = newParagraphs.find((p) => p.no === no)?.text ?? '';
    return { no, parts: diffChars(oldText, newText) };
  });

  return {
    id: entry.data.id,
    title: entry.data.title,
    renamedFrom: entry.data.renamed_from,
    isRenamed,
    isNew,
    paragraphDiffs,
  };
}
