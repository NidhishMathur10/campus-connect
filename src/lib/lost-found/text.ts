/** Digit runs of 6+ characters (ID / card / phone numbers) never go in public text. */
export function scrubNumbers(text: string): string {
  return text.replace(/\d[\d\s-]{5,}\d/g, "").replace(/\s{2,}/g, " ").trim();
}
