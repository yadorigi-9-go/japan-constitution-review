import { getCollection, type CollectionEntry } from 'astro:content';
import { renderOgImage } from '../../../../../lib/og/render';
import { OG_COLORS } from '../../../../../lib/og/colors';
import { articleLabel } from '../../../../../lib/draftDiff';

export async function getStaticPaths() {
  const drafts = await getCollection('drafts');
  const draftDeletions = await getCollection('draftDeletions');
  const draftById = new Map(drafts.map((draft) => [draft.id, draft]));

  return draftDeletions.map((entry) => {
    const [draftId] = entry.id.split('/');
    return {
      params: { draftId, articleId: entry.data.id },
      props: { draft: draftById.get(draftId)!, entry },
    };
  });
}

interface Props {
  draft: CollectionEntry<'drafts'>;
  entry: CollectionEntry<'draftDeletions'>;
}

export async function GET({ props }: { props: Props }) {
  const { draft, entry } = props;
  const png = await renderOgImage({
    eyebrow: `data/drafts/${draft.id}/del-${entry.data.id}.yaml`,
    title: entry.data.title,
    subtitle: `${draft.data.name} / ${articleLabel(entry.data.id)}`,
    badge: { label: '削除', color: OG_COLORS.inkMuted, background: OG_COLORS.paperRaised },
    titleFontSize: 48,
  });
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
}
