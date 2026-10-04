import bcrypt from 'bcrypt';
import { AuthRepository } from './auth.repository.js';

export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  async register(email: string, password: string) {
    const existingUser = await this.authRepository.findUserByEmail(email);

    if (existingUser) {
      throw new Error('User already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await this.authRepository.createUser(
      email,
      passwordHash,
    );

    return {
      id: user.id,
      email: user.email,
    };
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.authRepository.findUserByEmail(email);

    if (!user) {
      return null;
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
    };
  }
}