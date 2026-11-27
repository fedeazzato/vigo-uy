// Props for every field that receives a vault secret (specs/secret-vault.md
// R6): no spell check (Chrome's enhanced spell check sends text to Google), no
// autofill, no autocorrect, no password-manager prompts.
export const SECRET_INPUT_PROPS = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  'data-1p-ignore': true,
  'data-lpignore': 'true',
} as const
