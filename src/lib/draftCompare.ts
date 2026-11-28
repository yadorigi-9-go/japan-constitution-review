import { getCollection, type CollectionEntry } from 'astro:content';
import { articleLabel } from './draftDiff';

// 改憲案同士の比較ビュー(/drafts/compare)用に、各改憲案の変更・新設・削除条文を
// 「どの現行条文に対する変更か」でまとめる(Issue #103)。
//
// 草案側の条文id(ファイル名)は案ごとに番号体系が異なりうる(新設章の挿入による改番など、
// docs/design.md 5.2)。草案側のidで突き合わせると、別の現行条文に対する変更同士を
// 比較してしまうため、既存条文の変更は renamed_from(なければ id)= 現行条文のidで
// まとめる。真に新設の条文(is_new: true)は現行条文を持たないため、草案側のidでまとめる
// (番号が同じでも内容が異なることがある点は画面上で注記する)。

export type CompareCellKind = 'changed' | 'renamed' | 'new' | 'deleted';

interface CompareCellBase {
  draftId: string;
  // 草案側の条文id。削除の場合は削除される現行条文のid。
  draftArticleId: string;
  title: string;
  href: string;
}

export type CompareCell =
  | (CompareCellBase & { kind: 'changed' | 'renamed' | 'new'; entry: CollectionEntry<'draftArticles'> })
  | (CompareCellBase & { kind: 'deleted'; entry: CollectionEntry<'draftDeletions'> });

export interface CompareGroup {
  // グループのキー。既存条文の変更・削除は現行条文id、新設は `new:<草案側id>`。
  key: string;
  // 画面上のアンカー用(英数字とハイフンのみ)。
  anchor: string;
  isNewGroup: boolean;
  label: string;
  // 現行条文id(新設グループは null)。
  currentId: string | null;
  cells: Map<string, CompareCell[]>;
}

function sortValue(id: string): number {
  if (id === 'preamble') return -1;
  const m = id.match(/^art-(\d+)(?:-(\d+))?$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]) * 1000 + Number(m[2] ?? 0);
}

export async function buildCompareGroups(base: string) {
  const drafts = (await getCollection('drafts')).sort(
    (a, b) => a.data.published_at.getTime() - b.data.published_at.getTime(),
  );
  const draftArticles = await getCollection('draftArticles');
  const draftDeletions = await getCollection('draftDeletions');

  const groups = new Map<string, CompareGroup>();
  const ensureGroup = (key: string, isNewGroup: boolean, idForLabel: string) => {
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        anchor: isNewGroup ? `new-${idForLabel}` : idForLabel,
        isNewGroup,
        label: articleLabel(idForLabel),
        currentId: isNewGroup ? null : idForLabel,
        cells: new Map(),
      };
      groups.set(key, group);
    }
    return group;
  };
  const addCell = (group: CompareGroup, cell: CompareCell) => {
    const list = group.cells.get(cell.draftId) ?? [];
    list.push(cell);
    group.cells.set(cell.draftId, list);
  };

  for (const entry of draftArticles) {
    const [draftId] = entry.id.split('/');
    const href = `${base}drafts/${draftId}/${entry.data.id}`;
    if (entry.data.is_new) {
      const group = ensureGroup(`new:${entry.data.id}`, true, entry.data.id);
      addCell(group, { draftId, kind: 'new', draftArticleId: entry.data.id, title: entry.data.title, href, entry });
      continue;
    }
    const currentId = entry.data.renamed_from ?? entry.data.id;
    const isRenamed = currentId !== entry.data.id;
    const group = ensureGroup(currentId, false, currentId);
    addCell(group, {
      draftId,
      kind: isRenamed ? 'renamed' : 'changed',
      draftArticleId: entry.data.id,
      title: entry.data.title,
      href,
      entry,
    });
  }

  for (const entry of draftDeletions) {
    const [draftId] = entry.id.split('/');
    const group = ensureGroup(entry.data.id, false, entry.data.id);
    addCell(group, {
      draftId,
      kind: 'deleted',
      draftArticleId: entry.data.id,
      title: entry.data.title,
      href: `${base}drafts/${draftId}/deleted/${entry.data.id}`,
      entry,
    });
  }

  const sortedGroups = [...groups.values()].sort((a, b) => {
    const ida = a.currentId ?? a.key.slice('new:'.length);
    const idb = b.currentId ?? b.key.slice('new:'.length);
    const diff = sortValue(ida) - sortValue(idb);
    if (diff !== 0) return diff;
    // 同じ番号なら、既存条文の変更を新設より先に並べる。
    return Number(a.isNewGroup) - Number(b.isNewGroup);
  });

  return { drafts, groups: sortedGroups };
}

export const CELL_KIND_LABEL: Record<CompareCellKind, string> = {
  changed: '変更',
  renamed: '改番',
  new: '新設',
  deleted: '削除',
};
