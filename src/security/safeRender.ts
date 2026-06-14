export function renderPlainText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
}
