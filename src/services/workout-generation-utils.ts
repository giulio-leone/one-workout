/**
 * Workout Generation Utils
 *
 * Utility functions for workout generation.
 * DRY principle: Shared utilities to avoid duplication.
 */

/**
 * Sanitize JSON string by escaping control characters inside string literals.
 * This fixes "Bad control character in string literal" errors from AI-generated JSON.
 */
export function sanitizeJsonString(jsonString: string): string {
  // Replace control characters that are invalid in JSON string literals
  // This regex finds string content between quotes and escapes control chars within
  return jsonString.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (_match, content) => {
    const sanitized = content
      // Escape unescaped newlines
      .replace(/(?<!\\)\n/g, '\\n')
      // Escape unescaped carriage returns
      .replace(/(?<!\\)\r/g, '\\r')
      // Escape unescaped tabs
      .replace(/(?<!\\)\t/g, '\\t')
      // Escape other control characters (ASCII 0-31 except those already handled)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, (char: string) => {
        return '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
      });
    return `"${sanitized}"`;
  });
}

/**
 * Extract JSON from text output (fallback for when structured output fails)
 */
export function extractJsonFromText(text: string): string | null {
  if (!text || text.length < 100) {
    return null;
  }

  // Remove thinking tags
  let jsonText = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();

  // Remove markdown code blocks
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  // Find JSON object boundaries
  const jsonStartIndex = jsonText.indexOf('{');
  if (jsonStartIndex === -1) {
    return null;
  }

  let braceCount = 0;
  let jsonEndIndex = -1;
  for (let i = jsonStartIndex; i < jsonText.length; i++) {
    if (jsonText[i] === '{') braceCount++;
    if (jsonText[i] === '}') braceCount--;
    if (braceCount === 0) {
      jsonEndIndex = i + 1;
      break;
    }
  }

  if (jsonEndIndex === -1) {
    return null;
  }

  return jsonText.substring(jsonStartIndex, jsonEndIndex);
}
