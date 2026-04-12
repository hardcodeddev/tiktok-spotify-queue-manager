'use strict';

// A basic list of common profanity. 
// In a production app, you might use a library like 'bad-words',
// but for a lightweight custom solution, this is easily manageable.
const BANNED_WORDS = [
  'nigger', 'faggot', 'kike', 'tranny', 'retard', // Hate speech
  'fuck', 'shit', 'asshole', 'bitch', 'cunt', 'dick', 'pussy', // General vulgarity
];

/**
 * Returns true if the string contains any banned words.
 * Simple case-insensitive partial match.
 */
function containsBadWords(text) {
  if (!text || typeof text !== 'string') return false;
  const cleanText = text.toLowerCase();
  return BANNED_WORDS.some(word => cleanText.includes(word));
}

module.exports = { containsBadWords };
