export function cleanLlmAnswer(raw: string): string {
  if (!raw) return '';
  
  // Remove <think>...</think> blocks completely
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  
  // Find the first known section header and trim everything before it
  const idx = s.search(/(###\s+(DRAFT STRATEGY|RECOMMENDATIONS|FINAL TEAM REVIEW))/i);
  if (idx >= 0) s = s.slice(idx);
  
  return s.trim();
}