export function createMockFile(
  name = "test.txt",
  content = "test content",
  type = "text/plain"
): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}
