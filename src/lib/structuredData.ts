// 条文ページの構造化データ(schema.org Legislation、JSON-LD。docs/design.md 9節、Issue #170)。
//
// - 現行の条文・前文だけに付ける。改憲案(data/drafts/)は成立した法令ではないため、
//   Legislation として扱わない(現行法令と誤認される構造化データにしない)。
// - 条文は日本国憲法の構成部分として、Legislation を isPartOf で親(日本国憲法)につなぐ。
//   schema.org の LegislationObject はファイル(PDF 等)を表す型のため使わない。
// - 値は事実のみ。公布日(1946-11-03)・施行日(1947-05-03)は確立した事実、本文・出典・
//   取得日は data/articles/ の値をそのまま使う。法令番号などデータにない値は入れない。

const CONSTITUTION = {
	'@type': 'Legislation',
	name: '日本国憲法',
	legislationType: '憲法',
	// legislationDate: 採択・署名の日(公布日)。legislationDateOfApplicability: 適用開始日(施行日)。
	legislationDate: '1946-11-03',
	legislationDateOfApplicability: '1947-05-03',
	legislationJurisdiction: 'JP',
	legislationLegalForce: 'https://schema.org/InForce',
	inLanguage: 'ja',
} as const;

interface ArticleInput {
	/** 例: "日本国憲法 第9条" / "日本国憲法 前文" */
	name: string;
	paragraphs: { text: string }[];
	/** このページの正規URL */
	url: string;
	/** 本文の出典(e-Gov) */
	sourceUrl: string;
	/** 本文を出典から取得した日 */
	retrievedAt: Date;
}

export function articleLegislation({ name, paragraphs, url, sourceUrl, retrievedAt }: ArticleInput) {
	return {
		'@context': 'https://schema.org',
		'@type': 'Legislation',
		name,
		url,
		inLanguage: 'ja',
		text: paragraphs.map((p) => p.text).join('\n'),
		legislationJurisdiction: 'JP',
		legislationLegalForce: 'https://schema.org/InForce',
		// この記述(本文)が有効な時点 = 出典から本文を取得した日
		legislationDateVersion: retrievedAt.toISOString().slice(0, 10),
		isBasedOn: sourceUrl,
		isPartOf: CONSTITUTION,
	};
}
