/** Pulls an 11-char YouTube video id out of any common URL shape a reviewer
 * might paste (watch?v=, youtu.be/, /embed/, /shorts/), or accepts a bare
 * id directly. Returns null if nothing recognizable is found. */
export function extractYoutubeId(input: string): string | null {
  const value = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return null;
}
