// OGP画像用の配色。src/styles/global.css のダークテーマの値を固定で使う
// (OGP画像は閲覧者のテーマ設定に関わらず常に1枚なので、見やすいダーク基調に固定する)。
export const OG_COLORS = {
  paper: '#0d1117',
  paperRaised: '#161b22',
  ink: '#e6edf3',
  inkMuted: '#848d97',
  line: '#30363d',
  danger: '#f85149',
  dangerBg: '#3d1216',
} as const;
