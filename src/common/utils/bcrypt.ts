import * as bcryptjs from 'bcrypt';

export function encodePassword(rawPassword: string) {
  const SALT = bcryptjs.genSaltSync();
  return bcryptjs.hashSync(rawPassword, SALT);
}

export function comparePasswords(rawPassword: string, hash: string) {
  return bcryptjs.compareSync(rawPassword, hash);
}
