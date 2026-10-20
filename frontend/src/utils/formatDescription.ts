export const formatDescription = (text: string): string => {
  if (!text) return '';
  
  // Clean up any double-escaped newlines or corrupted formatting
  let cleaned = text.replace(/\\n/g, '\n');
  
  return cleaned;
};

