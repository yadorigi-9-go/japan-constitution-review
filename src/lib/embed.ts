// kind: embed のコメントについて、source_url から埋め込み可能な動画・投稿かどうかを判定する
// (docs/design.md 8節「映像・SNS」、Issue #136)。
// 対応していないURLの場合は null を返し、呼び出し側は kind: speech と同様の表示にフォールバックする。

export type EmbedInfo = { provider: 'youtube'; id: string } | { provider: 'twitter'; id: string };

const YOUTUBE_PATTERN = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/;
const TWITTER_PATTERN = /(?:^https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/;

export function detectEmbed(url: string): EmbedInfo | null {
	const youtube = url.match(YOUTUBE_PATTERN);
	if (youtube) return { provider: 'youtube', id: youtube[1] };

	const twitter = url.match(TWITTER_PATTERN);
	if (twitter) return { provider: 'twitter', id: twitter[1] };

	return null;
}
