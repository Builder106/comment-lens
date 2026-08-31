const line = "// inside a string";
const pattern = /\/\* inside a regex \*\//;
const template = `# inside a template`;
// This comment is outside literals.
export function format(value: string): string {
  /* A grouped
   * Unicode comment: café.
   */
  return `${value}`;
}
