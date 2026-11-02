import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { loadOgFonts } from './fonts';
import { OG_COLORS } from './colors';

const WIDTH = 1200;
const HEIGHT = 630;

// satori は React 要素と同じ形({type, props: {..., children}})を素のオブジェクトとして
// 受け取れる。JSX を使わないのは、このファイルが .astro 由来のビルドパイプラインの外(.ts
// の静的APIルート)で動くため、React を依存に追加せずに済ませるため。
type Node = { type: string; props: Record<string, unknown> } | string | false | null | undefined;

function el(type: string, props: Record<string, unknown>, children: Node[]): Node {
  return { type, props: { ...props, children: children.filter((c) => c !== false && c != null) } };
}

export interface OgBadge {
  label: string;
  color: string;
  background: string;
}

export interface OgImageProps {
  // ファイルパス風の小さな見出し(例: "data/articles/art-009.yaml")
  eyebrow: string;
  title: string;
  subtitle?: string;
  badge?: OgBadge;
  // 条文番号(例: "第9条")は大きく、改憲案の変更内容タイトルのような長文は
  // 小さめに表示する。
  titleFontSize?: number;
}

export async function renderOgImage({
  eyebrow,
  title,
  subtitle,
  badge,
  titleFontSize = 76,
}: OgImageProps): Promise<Buffer> {
  const fonts = await loadOgFonts();

  const tree = el(
    'div',
    {
      style: {
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: OG_COLORS.paper,
        fontFamily: 'Noto Sans CJK JP',
      },
    },
    [
      // GitHub の PR/diff 画面のアクセントバーを模した上辺の帯。
      el('div', { style: { display: 'flex', height: '10px', backgroundColor: OG_COLORS.danger } }, []),
      el(
        'div',
        { style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '56px 64px' } },
        [
          el(
            'div',
            { style: { display: 'flex', fontSize: 26, color: OG_COLORS.inkMuted } },
            [eyebrow],
          ),
          el(
            'div',
            { style: { display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: '20px' } },
            [
              badge &&
                el(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      alignSelf: 'flex-start',
                      fontSize: 26,
                      color: badge.color,
                      backgroundColor: badge.background,
                      border: `2px solid ${badge.color}`,
                      borderRadius: '999px',
                      padding: '4px 22px',
                    },
                  },
                  [badge.label],
                ),
              el(
                'div',
                {
                  style: {
                    display: 'flex',
                    fontSize: titleFontSize,
                    fontWeight: 700,
                    color: OG_COLORS.ink,
                    lineHeight: 1.25,
                  },
                },
                [title],
              ),
              subtitle &&
                el('div', { style: { display: 'flex', fontSize: 34, color: OG_COLORS.inkMuted } }, [subtitle]),
            ],
          ),
          el(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                fontSize: 28,
                fontWeight: 700,
                color: OG_COLORS.ink,
                borderTop: `2px solid ${OG_COLORS.line}`,
                paddingTop: '28px',
              },
            },
            ['日本国憲法レビュー'],
          ),
        ],
      ),
    ],
  );

  const svg = await satori(tree, { width: WIDTH, height: HEIGHT, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
  return resvg.render().asPng();
}
