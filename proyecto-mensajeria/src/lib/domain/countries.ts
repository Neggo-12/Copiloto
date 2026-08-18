export interface Country {
  code: string; // ISO-3166 alpha-2
  name: string;
  dialCode: string; // con +
  flag: string;
  nationalDigits: number; // longitud esperada del número nacional
}

export const COUNTRIES: Country[] = [
  { code: "CO", name: "Colombia", dialCode: "+57", flag: "🇨🇴", nationalDigits: 10 },
  { code: "MX", name: "México", dialCode: "+52", flag: "🇲🇽", nationalDigits: 10 },
  { code: "AR", name: "Argentina", dialCode: "+54", flag: "🇦🇷", nationalDigits: 10 },
  { code: "CL", name: "Chile", dialCode: "+56", flag: "🇨🇱", nationalDigits: 9 },
  { code: "PE", name: "Perú", dialCode: "+51", flag: "🇵🇪", nationalDigits: 9 },
  { code: "EC", name: "Ecuador", dialCode: "+593", flag: "🇪🇨", nationalDigits: 9 },
  { code: "ES", name: "España", dialCode: "+34", flag: "🇪🇸", nationalDigits: 9 },
  { code: "US", name: "Estados Unidos", dialCode: "+1", flag: "🇺🇸", nationalDigits: 10 },
  { code: "BR", name: "Brasil", dialCode: "+55", flag: "🇧🇷", nationalDigits: 11 },
];

export const DEFAULT_COUNTRY_CODE = "CO";

export function findCountry(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0]!;
}

export function normalizeNationalNumber(input: string): string {
  return input.replace(/\D/g, "");
}

export function formatNationalNumber(input: string): string {
  const digits = normalizeNationalNumber(input);
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

export function isValidNationalNumber(input: string, country: Country): boolean {
  return normalizeNationalNumber(input).length === country.nationalDigits;
}

export function toE164(input: string, country: Country): string {
  return `${country.dialCode}${normalizeNationalNumber(input)}`;
}
