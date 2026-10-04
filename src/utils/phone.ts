export interface PhoneNormalizationResult {
  normalized: string | null;
  original: string;
  isValid: boolean;
  isAlreadyE164: boolean;
  status: "already_e164" | "normalized" | "empty" | "invalid";
  error?: string;
}

/**
 * Normalizes a Brazilian or international phone number to E.164 standard.
 *
 * Rules:
 * 1. Remove non-numeric characters.
 * 2. If 10 or 11 digits (DDD + landline/mobile), add "+55".
 * 3. If 12 or 13 digits starting with "55", add "+".
 * 4. If already starting with "+" and has 8..15 digits, preserve E.164.
 * 5. If invalid/incomplete, returns normalized: null and error description for manual review report.
 */
export function normalizePhoneNumber(rawPhone: string | null | undefined): PhoneNormalizationResult {
  const original = rawPhone ? String(rawPhone).trim() : "";

  if (!original) {
    return {
      normalized: null,
      original,
      isValid: false,
      isAlreadyE164: false,
      status: "empty",
      error: "Sem telefone cadastrado",
    };
  }

  // Already E.164
  if (original.startsWith("+")) {
    const digits = original.replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) {
      return {
        normalized: "+" + digits,
        original,
        isValid: true,
        isAlreadyE164: true,
        status: "already_e164",
      };
    } else {
      return {
        normalized: null,
        original,
        isValid: false,
        isAlreadyE164: false,
        status: "invalid",
        error: `Formato com '+' com número de dígitos inválido (${digits.length} dígitos)`,
      };
    }
  }

  // Clean all non-numeric characters
  let digits = original.replace(/\D/g, "");

  if (!digits) {
    return {
      normalized: null,
      original,
      isValid: false,
      isAlreadyE164: false,
      status: "invalid",
      error: "Nenhum dígito numérico encontrado",
    };
  }

  // Handle leading zero if typed e.g. 018997336187 or 05518997336187
  if (digits.startsWith("055") && (digits.length === 13 || digits.length === 14)) {
    digits = digits.slice(1);
  } else if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  // 10 digits (DDD + 8 digits landline) -> +55...
  if (digits.length === 10) {
    return {
      normalized: `+55${digits}`,
      original,
      isValid: true,
      isAlreadyE164: false,
      status: "normalized",
    };
  }

  // 11 digits (DDD + 9 digits mobile) -> +55...
  if (digits.length === 11) {
    return {
      normalized: `+55${digits}`,
      original,
      isValid: true,
      isAlreadyE164: false,
      status: "normalized",
    };
  }

  // 12 or 13 digits starting with 55 -> +55...
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return {
      normalized: `+${digits}`,
      original,
      isValid: true,
      isAlreadyE164: false,
      status: "normalized",
    };
  }

  return {
    normalized: null,
    original,
    isValid: false,
    isAlreadyE164: false,
    status: "invalid",
    error: `Dígitos incompletos ou fora do padrão (${digits.length} dígitos: "${digits}")`,
  };
}

export interface WhatsAppPhoneDetails {
  primaryDigits: string;
  primaryFormatted: string;
  alternateDigits: string | null;
  alternateFormatted: string | null;
  primaryUrl: string;
  alternateUrl: string | null;
}

/**
 * Returns primary and alternate (with/without 9th digit) WhatsApp links & formatted numbers.
 * This solves WhatsApp's "Número não está cadastrado" error when Brazilian accounts
 * were registered in WhatsApp with or without the 9th digit.
 */
export function getWhatsAppPhoneDetails(rawPhone: string | null | undefined, message: string = ""): WhatsAppPhoneDetails | null {
  if (!rawPhone) return null;

  let digits = rawPhone.replace(/\D/g, "");
  if (!digits) return null;

  // Remove leading zeros if present (e.g. 018... or 055...)
  if (digits.startsWith("055") && digits.length >= 12) {
    digits = digits.slice(1);
  } else if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  // Prepend 55 if missing
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    digits = "55" + digits;
  }

  const encodedMsg = encodeURIComponent(message);
  const baseUrl = "https://api.whatsapp.com/send";

  // Check if it's a Brazilian number starting with 55
  if (digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);

    // 13 digits: 55 + DDD (2) + 9 + 8 digits (e.g. 55 18 98106 6775)
    if (digits.length === 13 && rest.startsWith("9")) {
      const primaryDigits = digits;
      const primaryFormatted = `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
      
      const restWithout9 = rest.slice(1); // 8 digits
      const alternateDigits = `55${ddd}${restWithout9}`; // 12 digits
      const alternateFormatted = `+55 (${ddd}) ${restWithout9.slice(0, 4)}-${restWithout9.slice(4)}`;

      return {
        primaryDigits,
        primaryFormatted,
        alternateDigits,
        alternateFormatted,
        primaryUrl: `${baseUrl}?phone=${primaryDigits}${message ? `&text=${encodedMsg}` : ""}`,
        alternateUrl: `${baseUrl}?phone=${alternateDigits}${message ? `&text=${encodedMsg}` : ""}`,
      };
    }

    // 12 digits: 55 + DDD (2) + 8 digits (e.g. 55 18 8106 6775)
    if (digits.length === 12) {
      const primaryDigits = digits;
      const primaryFormatted = `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;

      const restWith9 = "9" + rest; // 9 digits
      const alternateDigits = `55${ddd}${restWith9}`; // 13 digits
      const alternateFormatted = `+55 (${ddd}) ${restWith9.slice(0, 5)}-${restWith9.slice(5)}`;

      return {
        primaryDigits,
        primaryFormatted,
        alternateDigits,
        alternateFormatted,
        primaryUrl: `${baseUrl}?phone=${primaryDigits}${message ? `&text=${encodedMsg}` : ""}`,
        alternateUrl: `${baseUrl}?phone=${alternateDigits}${message ? `&text=${encodedMsg}` : ""}`,
      };
    }
  }

  // Fallback for non-Brazilian or other lengths
  const primaryFormatted = rawPhone.startsWith("+") ? rawPhone : `+${digits}`;
  return {
    primaryDigits: digits,
    primaryFormatted,
    alternateDigits: null,
    alternateFormatted: null,
    primaryUrl: `${baseUrl}?phone=${digits}${message ? `&text=${encodedMsg}` : ""}`,
    alternateUrl: null,
  };
}

