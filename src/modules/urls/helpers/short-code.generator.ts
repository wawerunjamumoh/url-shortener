import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const CODE_LENGTH = 8;
const BASE = ALPHABET.length;

export function generateShortCode(): string {
    let code = '';

    while (code.length < CODE_LENGTH) {
        const bytes = randomBytes(16);

        for(const byte of bytes) {
            // Reject value which would cause modulo bias
            if (byte >= 248) continue;

            code += ALPHABET[byte % BASE];

            if (code.length === CODE_LENGTH) {
                break;
            }
        }
    }

    return code;
}