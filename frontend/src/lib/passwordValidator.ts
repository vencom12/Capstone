/**
 * Strict Enterprise Password Validation
 * Enforces:
 * - Minimum 8 characters
 * - At least 1 uppercase letter (A-Z)
 * - At least 1 lowercase letter (a-z)
 * - At least 1 numeric digit (0-9)
 */
export function validateStrictPassword(password: string): string | null {
  if (!password) return 'Please enter a password.';
  if (password.length < 8) return 'Must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Must include an uppercase letter (A-Z).';
  if (!/[a-z]/.test(password)) return 'Must include a lowercase letter (a-z).';
  if (!/[0-9]/.test(password)) return 'Must include a number (0-9).';
  return null;
}

