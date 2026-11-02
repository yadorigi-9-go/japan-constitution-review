import { getCollection, type CollectionEntry } from 'astro:content';
import { renderOgImage } from '../../../lib/og/render';
import { OG_COLORS } from '../../../lib/og/colors';

export async function getStaticPaths() {
  const drafts = await getCollection('drafts');
  return drafts.map((draft) => ({
    params: { draftId: draft.id },
    props: { draft },
  }));
}

interface Props {
  draft: CollectionEntry<'drafts'>;
}

export async function GET({ props }: { props: Props }) {
  const { draft } = props;
  const png = await renderOgImage({
    eyebrow: `data/drafts/${draft.id}/meta.yaml`,
    title: draft.data.name,
    subtitle: `提案: ${draft.data.proposer}`,
    badge:
      draft.data.status === 'outline'
        ? { label: 'たたき台(未完成)', color: OG_COLORS.inkMuted, background: OG_COLORS.paperRaised }
        : undefined,
  });
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
}
