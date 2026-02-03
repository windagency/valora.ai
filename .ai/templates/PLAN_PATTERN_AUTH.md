# Planning Template: Authentication/Authorization

## Pattern Type: Auth Implementation

**Use when**: Adding login, registration, JWT tokens, OAuth, or role-based access control.

---

## Quick Fill Template

### 1. Auth Overview

| Field | Value |
|-------|-------|
| **Auth Type** | [ ] JWT [ ] Session [ ] OAuth [ ] API Key |
| **OAuth Providers** | [ ] Google [ ] GitHub [ ] Microsoft [ ] Custom |
| **MFA** | [ ] None [ ] TOTP [ ] SMS [ ] Email |
| **RBAC** | [ ] None [ ] Simple Roles [ ] Permissions |

### 2. Auth Flow Selection

| Flow | Use Case | Complexity |
|------|----------|------------|
| **Password + JWT** | API-first apps | Medium |
| **OAuth 2.0** | Social login | Medium |
| **Magic Link** | Passwordless | Low |
| **Session-based** | Traditional web | Low |

### 3. Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/auth/auth.service.ts` | Create | Auth business logic |
| `src/auth/auth.controller.ts` | Create | Auth endpoints |
| `src/auth/strategies/*.ts` | Create | Passport strategies |
| `src/auth/guards/*.ts` | Create | Route guards |
| `src/auth/decorators/*.ts` | Create | Auth decorators |
| `src/middleware/auth.middleware.ts` | Create | Auth middleware |
| `tests/auth.test.ts` | Create | Auth tests |

### 4. Standard Implementation Steps

#### Step 1: User Entity (if not exists)

**Objective**: Create user model with password handling

**Files**:
- `prisma/schema.prisma`
- `src/services/password.service.ts`

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String?
  role         Role     @default(USER)
  isVerified   Boolean  @default(false)

  refreshTokens RefreshToken[]

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

enum Role {
  USER
  ADMIN
}

model RefreshToken {
  id        String   @id @default(uuid())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

```typescript
// password.service.ts
import { hash, compare } from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return compare(password, hash);
}
```

**Validation**: User can be created with hashed password

---

#### Step 2: JWT Service

**Objective**: Implement token generation and validation

**Files**:
- `src/auth/jwt.service.ts`

```typescript
import { sign, verify } from 'jsonwebtoken';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
}

export class JwtService {
  private readonly accessSecret = process.env.JWT_ACCESS_SECRET!;
  private readonly refreshSecret = process.env.JWT_REFRESH_SECRET!;
  private readonly accessExpiry = '15m';
  private readonly refreshExpiry = '7d';

  generateAccessToken(payload: TokenPayload): string {
    return sign(payload, this.accessSecret, { expiresIn: this.accessExpiry });
  }

  generateRefreshToken(payload: TokenPayload): string {
    return sign(payload, this.refreshSecret, { expiresIn: this.refreshExpiry });
  }

  verifyAccessToken(token: string): TokenPayload {
    return verify(token, this.accessSecret) as TokenPayload;
  }

  verifyRefreshToken(token: string): TokenPayload {
    return verify(token, this.refreshSecret) as TokenPayload;
  }
}
```

**Validation**: Tokens generate and verify correctly

---

#### Step 3: Auth Service

**Objective**: Implement auth business logic

**Files**:
- `src/auth/auth.service.ts`

```typescript
export class AuthService {
  constructor(
    private userRepository: UserRepository,
    private jwtService: JwtService,
    private refreshTokenRepository: RefreshTokenRepository
  ) {}

  async register(data: RegisterDto): Promise<AuthResponse> {
    const exists = await this.userRepository.findByEmail(data.email);
    if (exists) throw new ConflictError('Email already registered');

    const passwordHash = await hashPassword(data.password);
    const user = await this.userRepository.create({ ...data, passwordHash });

    return this.generateTokens(user);
  }

  async login(data: LoginDto): Promise<AuthResponse> {
    const user = await this.userRepository.findByEmail(data.email);
    if (!user) throw new UnauthorizedError('Invalid credentials');

    const valid = await verifyPassword(data.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    return this.generateTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const payload = this.jwtService.verifyRefreshToken(refreshToken);
    const stored = await this.refreshTokenRepository.findByToken(refreshToken);

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const user = await this.userRepository.findById(payload.sub);
    await this.refreshTokenRepository.delete(stored.id);

    return this.generateTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokenRepository.deleteByToken(refreshToken);
  }

  private async generateTokens(user: User): Promise<AuthResponse> {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.generateAccessToken(payload);
    const refreshToken = this.jwtService.generateRefreshToken(payload);

    await this.refreshTokenRepository.create({
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return { accessToken, refreshToken, user: this.sanitizeUser(user) };
  }
}
```

**Validation**: Register, login, refresh, logout work correctly

---

#### Step 4: Auth Middleware/Guard

**Objective**: Protect routes with authentication

**Files**:
- `src/middleware/auth.middleware.ts`

```typescript
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('No token provided');
  }

  const token = header.slice(7);
  try {
    const payload = jwtService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    throw new UnauthorizedError('Invalid token');
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
    next();
  };
}
```

**Validation**: Protected routes reject unauthenticated requests

---

#### Step 5: Auth Endpoints

**Objective**: Create auth API routes

**Files**:
- `src/auth/auth.controller.ts`
- `src/auth/auth.routes.ts`

```typescript
// Routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authMiddleware, authController.logout);
router.get('/me', authMiddleware, authController.me);
```

**Validation**: All auth endpoints accessible and functional

---

#### Step 6: Write Tests

**Objective**: Add comprehensive auth tests

**Files**:
- `tests/auth.test.ts`

```typescript
describe('Auth', () => {
  describe('POST /auth/register', () => {
    it('creates user and returns tokens', async () => {});
    it('rejects duplicate email', async () => {});
    it('validates password strength', async () => {});
  });

  describe('POST /auth/login', () => {
    it('returns tokens for valid credentials', async () => {});
    it('rejects invalid email', async () => {});
    it('rejects invalid password', async () => {});
  });

  describe('POST /auth/refresh', () => {
    it('returns new tokens', async () => {});
    it('rejects expired token', async () => {});
    it('rejects used token', async () => {});
  });
});
```

**Validation**: `pnpm test:quick` passes

---

### 5. Environment Variables

```bash
JWT_ACCESS_SECRET=your-access-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
BCRYPT_SALT_ROUNDS=12
```

### 6. Standard Risks

| Risk | Mitigation |
|------|------------|
| Token theft | Short access expiry, secure cookies |
| Brute force | Rate limiting, account lockout |
| Password leak | Bcrypt hashing, no logging |
| CSRF | SameSite cookies, CSRF tokens |
| XSS token theft | HttpOnly cookies |

### 7. Security Checklist

- [ ] Passwords hashed with bcrypt (rounds >= 12)
- [ ] JWTs have short expiry (15-30 min)
- [ ] Refresh tokens stored in DB and revocable
- [ ] Rate limiting on auth endpoints
- [ ] No sensitive data in JWT payload
- [ ] HTTPS only in production
- [ ] Secure cookie flags set

### 8. Rollback

```bash
# Revert changes
git revert HEAD

# Remove auth tables
pnpm prisma migrate reset
```

---

## Estimated Effort

| Step | Points | Confidence |
|------|--------|------------|
| User Entity | 2 | High |
| JWT Service | 2 | High |
| Auth Service | 3 | Medium |
| Middleware | 1 | High |
| Endpoints | 2 | High |
| Tests | 3 | Medium |
| **Total** | **13** | **Medium** |
