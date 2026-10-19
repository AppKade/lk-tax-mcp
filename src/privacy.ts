// Reject identifier-shaped free text while preserving canonical decimal money strings.
// This is defence in depth. It cannot undo identifiers users type into host chat.
const identifier = /(?<![\w.])(?:\d{9}[vVxX]|\d{12}|\d{9})(?![\w.])/;
const privateKey = /^(?:name|full_name|employer_name|bank_name|tin|nic|account_number|certificate_number|raw_text|password|pin)$/i;
export function assertPrivateOutput(value: unknown): void {
  if (typeof value === 'string' && identifier.test(value)) throw new Error('PRIVATE_OUTPUT_BLOCKED');
  if (Array.isArray(value)) value.forEach(assertPrivateOutput);
  else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (privateKey.test(key)) throw new Error('PRIVATE_OUTPUT_BLOCKED');
      assertPrivateOutput(child);
    }
  }
}
