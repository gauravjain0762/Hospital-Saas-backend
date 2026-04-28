const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i;

export const formatLegalContent = (content = "") => {
  if (!content) return "";

  const text = String(content);
  if (!text) return "";

  if (!text.trim()) return "";

  // If the content already contains HTML tags, preserve it exactly as stored.
  if (HTML_TAG_PATTERN.test(text)) {
    return text;
  }

  // Plain text: turn each non-empty line into its own paragraph.
  return text.trim()
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join("");
};
