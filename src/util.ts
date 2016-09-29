import { SemanticVersion } from './definitions';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEMVER_REGEX = /^v?([0-9]+)\.?([0-9]+)?\.?([0-9]+)?\.?.*$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function parseSemanticVersion(s: string): SemanticVersion {
  let r = s.trim().match(SEMVER_REGEX);

  if (!r) {
    throw new Error('Invalid semantic version.');
  }

  let v: SemanticVersion = {
    'major': Number(r[1])
  };

  if (r[2]) {
    v.minor = Number(r[2]);
  }

  if (r[3]) {
    v.patch = Number(r[3]);
  }

  return v;
}
