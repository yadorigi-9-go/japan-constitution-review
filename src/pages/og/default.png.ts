import { renderOgImage } from '../../lib/og/render';

// 条文・改憲案ごとのOGP画像を持たないページ(トップ・検索・このサイトについて 等)で使う
// サイト共通のOGP画像 (docs/design.md 9節)。
export async function GET() {
  const png = await renderOgImage({
    eyebrow: 'japan-constitution-review',
    title: '日本国憲法レビュー',
    subtitle: '日本国憲法と改憲案の論点・リスクを、コードレビュー形式で検証する非公式サイト',
  });
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
}
