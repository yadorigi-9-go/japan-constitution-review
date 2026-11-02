// OGP画像(satori)用のフォント読み込み。
//
// Google Fonts の CSS2 API は Noto Sans JP を文字レンジごとに大量分割して配信するため、
// (1条文分のタイトル程度でも、どの分割ファイルに必要な字が入っているか予測できない)、
// 分割されていない単一ファイルの Noto Sans CJK JP を Google/Adobe の公式リポジトリから
// 直接取得して使う。ビルド時にのみ必要なファイル(数十MB)であり、生成されるのは
// PNG画像のみのため、サイト閲覧者がこのフォント自体をダウンロードすることはない。
const FONT_BASE_URL = 'https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Sans/OTF/Japanese';

type OgFont = { name: string; data: Buffer; weight: 400 | 700; style: 'normal' };

let fontsPromise: Promise<OgFont[]> | null = null;

async function fetchFont(filename: string): Promise<Buffer> {
  const res = await fetch(`${FONT_BASE_URL}/${filename}`);
  if (!res.ok) {
    throw new Error(`OGP画像用フォントの取得に失敗しました: ${filename} (status ${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export function loadOgFonts(): Promise<OgFont[]> {
  fontsPromise ??= Promise.all([
    fetchFont('NotoSansCJKjp-Regular.otf'),
    fetchFont('NotoSansCJKjp-Bold.otf'),
  ]).then(([regular, bold]) => [
    { name: 'Noto Sans CJK JP', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Noto Sans CJK JP', data: bold, weight: 700 as const, style: 'normal' as const },
  ]);
  return fontsPromise;
}
