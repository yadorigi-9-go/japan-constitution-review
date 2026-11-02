import { getCollection, type CollectionEntry } from 'astro:content';
import { renderOgImage } from '../../../../lib/og/render';
import { OG_COLORS } from '../../../../lib/og/colors';
import { articleLabel } from '../../../../lib/draftDiff';

export async function getStaticPaths() {
  const drafts = await getCollection('drafts');
  const draftArticles = await getCollection('draftArticles');
  const draftById = new Map(drafts.map((draft) => [draft.id, draft]));

  return draftArticles.map((entry) => {
    const [draftId] = entry.id.split('/');
    return {
      params: { draftId, articleId: entry.data.id },
      props: { draft: draftById.get(draftId)!, entry },
    };
  });
}

interface Props {
  draft: CollectionEntry<'drafts'>;
  entry: CollectionEntry<'draftArticles'>;
}

export async function GET({ props }: { props: Props }) {
  const { draft, entry } = props;
  // バッジ・色分けの分類は src/pages/drafts/[draftId]/index.astro のステータス分類と揃える。
  const isRenamed = Boolean(entry.data.renamed_from) && entry.data.renamed_from !== entry.data.id;
  const badge = entry.data.is_new
    ? { label: '新設', color: OG_COLORS.danger, background: OG_COLORS.dangerBg }
    : isRenamed
      ? { label: '改番', color: OG_COLORS.inkMuted, background: OG_COLORS.paperRaised }
      : undefined;
  const label = isRenamed
    ? `${articleLabel(entry.data.renamed_from!)} → ${articleLabel(entry.data.id)}`
    : articleLabel(entry.data.id);

  const png = await renderOgImage({
    eyebrow: `data/drafts/${draft.id}/${entry.data.id}.yaml`,
    title: entry.data.title,
    subtitle: `${draft.data.name} / ${label}`,
    badge,
    titleFontSize: 48,
  });
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
}
