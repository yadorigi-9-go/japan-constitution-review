import { getCollection, type CollectionEntry } from 'astro:content';
import { renderOgImage } from '../../../lib/og/render';

export async function getStaticPaths() {
  const articles = await getCollection('articles');
  return articles.map((article) => ({
    params: { id: article.id },
    props: { article },
  }));
}

interface Props {
  article: CollectionEntry<'articles'>;
}

export async function GET({ props }: { props: Props }) {
  const { article } = props;
  const title = article.data.kind === 'preamble' ? '前文' : `第${article.data.number}条`;
  const subtitle = article.data.kind === 'article' ? article.data.chapter : undefined;
  const png = await renderOgImage({
    eyebrow: `data/articles/${article.id}.yaml`,
    title,
    subtitle,
  });
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
}
