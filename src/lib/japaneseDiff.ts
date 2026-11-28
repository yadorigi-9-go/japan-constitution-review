// 日本語の条文を語句単位で比較する(Issue #169)。
//
// jsdiff の diffChars(1文字単位)では、「公共の福祉」→「公益及び公の秩序」のような書き換えが、
// 偶然一致する1文字(「公」「の」など)で細切れの追加・削除として表示されて読みにくい。
// そこで Intl.Segmenter('ja', { granularity: 'word' }) で語に分けてから比較し、さらに、
// 変更と変更に挟まれた短い一致(ひらがな・句読点のみの2文字以下。助詞など)を前後の変更に
// 吸収する。漢字を含む一致(「責任」など)は意味のある一致として残す。
//
// 差分はビルド時に生成する(静的サイトのため、閲覧環境による分割の違いは生じない)。
// Astro に依存しない純粋な関数にしておき、Node 単体でも検証できるようにする。
import { diffChars, diffWords } from 'diff';

export interface DiffPart {
	value: string;
	added?: boolean;
	removed?: boolean;
}

/** 変更に挟まれたときに吸収する短い一致(ひらがな・句読点・括弧のみ、2文字以下) */
const ABSORBABLE = /^[぀-ゟ、。・「」()()\s]{1,2}$/;

const segmenter: Intl.Segmenter | null =
	typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;

type Run = { equal: string } | { removed: string; added: string };

function absorbShortMatches(parts: DiffPart[]): DiffPart[] {
	// 連続する追加・削除を1つの「変更」にまとめる。
	const runs: Run[] = [];
	for (const p of parts) {
		if (p.added || p.removed) {
			let change = runs[runs.length - 1];
			if (!change || !('removed' in change)) {
				change = { removed: '', added: '' };
				runs.push(change);
			}
			if (p.removed) change.removed += p.value;
			else change.added += p.value;
		} else {
			runs.push({ equal: p.value });
		}
	}
	// 変更 / 短い一致 / 変更 の並びを、1つの変更にまとめる。
	for (let i = 1; i < runs.length - 1; i++) {
		const mid = runs[i];
		const prev = runs[i - 1];
		const next = runs[i + 1];
		if ('equal' in mid && ABSORBABLE.test(mid.equal) && 'removed' in prev && 'removed' in next) {
			prev.removed += mid.equal + next.removed;
			prev.added += mid.equal + next.added;
			runs.splice(i, 2);
			i--;
		}
	}
	// GitHub の diff 表示に合わせ、変更は削除を先、追加を後に出す。
	const out: DiffPart[] = [];
	for (const r of runs) {
		if ('equal' in r) {
			out.push({ value: r.equal });
		} else {
			if (r.removed) out.push({ value: r.removed, removed: true });
			if (r.added) out.push({ value: r.added, added: true });
		}
	}
	return out;
}

/** 現行の文(oldText)と改正後の文(newText)の語句単位の差分。 */
export function diffJapanese(oldText: string, newText: string): DiffPart[] {
	if (!segmenter) return diffChars(oldText, newText);
	return absorbShortMatches(diffWords(oldText, newText, { intlSegmenter: segmenter }));
}
