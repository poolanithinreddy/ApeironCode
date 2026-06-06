const scoreLine = (line: string, keywords: string[]): number => {
  const lowerLine = line.toLowerCase();
  return keywords.reduce((score, keyword) => (lowerLine.includes(keyword) ? score + 1 : score), 0);
};

export const extractRelevantSnippet = (
  content: string,
  keywords: string[],
  maxLines = 40,
): string => {
  const lines = content.split(/\r?\n/u);
  if (lines.length <= maxLines) {
    return lines.map((line, index) => `${index + 1}: ${line}`).join('\n');
  }

  let bestStart = 0;
  let bestScore = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const windowScore = lines
      .slice(index, index + Math.min(maxLines, lines.length - index))
      .reduce((score, line) => score + scoreLine(line, keywords), 0);
    if (windowScore > bestScore) {
      bestScore = windowScore;
      bestStart = index;
    }
  }

  return lines
    .slice(bestStart, bestStart + maxLines)
    .map((line, index) => `${bestStart + index + 1}: ${line}`)
    .join('\n');
};