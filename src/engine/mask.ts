/**
 * Dependency-free token input masking, applied in the engine's value path so
 * every adapter gets it. Tokens: `9` = digit, `a` = letter, `*` = alphanumeric;
 * everything else is a literal. Form state holds the RAW token characters
 * ("1234567890"); the component displays the masked form ("(123) 456-7890").
 *
 * stripMask walks the mask grammar (mirroring applyMask), so masks with
 * ALPHANUMERIC literals ("PO-9999", "9999 kg") round-trip correctly — literal
 * characters are consumed as formatting, never absorbed into the raw value.
 */
const TOKENS: Record<string, RegExp> = { "9": /\d/, a: /[a-zA-Z]/, "*": /[a-zA-Z0-9]/ };

/** Number of token positions in a mask — the raw value's maximum length. */
export function maskCapacity(mask: string): number {
  let n = 0;
  for (const ch of mask) if (TOKENS[ch]) n++;
  return n;
}

/** Format a raw value against the mask (invalid characters are skipped). */
export function applyMask(raw: string, mask: string): string {
  let out = "";
  let ri = 0;
  for (let mi = 0; mi < mask.length && ri < raw.length; mi++) {
    const token = TOKENS[mask[mi]!];
    if (token) {
      while (ri < raw.length && !token.test(raw[ri]!)) ri++; // drop chars the slot rejects
      if (ri >= raw.length) break;
      out += raw[ri++]!;
    } else {
      out += mask[mi]!;
    }
  }
  return out;
}

/**
 * Recover the raw token characters from a (partially) masked display string by
 * walking mask positions: literals are consumed when present, token slots
 * collect the next character that fits (skipping stray formatting the user
 * typed). Output length is naturally capped at maskCapacity(mask).
 */
export function stripMask(display: string, mask: string): string {
  let out = "";
  let di = 0;
  for (let mi = 0; mi < mask.length && di < display.length; mi++) {
    const mch = mask[mi]!;
    const token = TOKENS[mch];
    if (token) {
      // skip characters this slot rejects (e.g. pasted punctuation)
      while (di < display.length && !token.test(display[di]!)) di++;
      if (di >= display.length) break;
      out += display[di++]!;
    } else if (display[di] === mch) {
      di++; // the literal is present at this position — consume as formatting
    }
    // literal absent (partial input) → stay on this display char for the next slot
  }
  return out;
}
