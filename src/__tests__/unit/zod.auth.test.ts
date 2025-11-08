import { describe, it, expect } from 'vitest';
import { authSchema } from '../../zod/auth';

describe('authSchema', () => {
  describe('valid payloads', () => {
    it('should validate a correct payload', () => {
      const validPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin', 'user'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validPayload);
      }
    });

    it('should validate payload with single role', () => {
      const validPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it('should validate payload with empty roles array', () => {
      const validPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: [],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it('should validate payload with multiple roles', () => {
      const validPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin', 'moderator', 'user', 'viewer'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.roles).toHaveLength(4);
      }
    });

    it('should validate payload with different UUID format', () => {
      const validPayload = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        roles: ['user'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it('should validate payload with large iat value', () => {
      const validPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin'],
        iat: 9999999999,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it('should validate payload with zero iat', () => {
      const validPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin'],
        iat: 0,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it('should validate payload with special role names', () => {
      const validPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin:write', 'user:read', 'moderator-super', 'viewer_basic'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });
  });

  describe('invalid payloads - missing fields', () => {
    it('should reject payload missing id', () => {
      const invalidPayload = {
        roles: ['admin'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject payload missing roles', () => {
      const invalidPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        iat: 1688132800,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject payload missing iat', () => {
      const invalidPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin'],
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject completely empty payload', () => {
      const invalidPayload = {};

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });
  });

  describe('invalid payloads - wrong types', () => {
    it('should reject when id is not a string', () => {
      const invalidPayload = {
        id: 12345,
        roles: ['admin'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject when id is not a valid UUID', () => {
      const invalidPayload = {
        id: 'not-a-uuid',
        roles: ['admin'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject when roles is not an array', () => {
      const invalidPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: 'admin',
        iat: 1688132800,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject when roles is an object', () => {
      const invalidPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: { admin: true },
        iat: 1688132800,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject when roles contains non-string values', () => {
      const invalidPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin', 123, true],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject when iat is not a number', () => {
      const invalidPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin'],
        iat: '1688132800',
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject when iat is a float (only integers allowed)', () => {
      const invalidPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin'],
        iat: 1688132800.5,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject when iat is null', () => {
      const invalidPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin'],
        iat: null,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject when iat is undefined', () => {
      const invalidPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin'],
        iat: undefined,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });
  });

  describe('invalid payloads - UUID validation', () => {
    it('should reject invalid UUID format (too short)', () => {
      const invalidPayload = {
        id: '12345678-1234-1234-1234-12345678901',
        roles: ['admin'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject invalid UUID format (wrong hyphens)', () => {
      const invalidPayload = {
        id: '123456781-1234-1234-1234-123456789012',
        roles: ['admin'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject empty string as id', () => {
      const invalidPayload = {
        id: '',
        roles: ['admin'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it('should reject UUID with invalid characters', () => {
      const invalidPayload = {
        id: '12345678-1234-1234-1234-12345678901G',
        roles: ['admin'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });
  });

  describe('extra fields handling', () => {
    it('should strip extra fields not in schema', () => {
      const payloadWithExtra = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin'],
        iat: 1688132800,
        extra: 'field',
        anotherExtra: 123,
      };

      const result = authSchema.safeParse(payloadWithExtra);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('extra');
        expect(result.data).not.toHaveProperty('anotherExtra');
      }
    });

    it('should only contain id, roles, and iat properties', () => {
      const validPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
      if (result.success) {
        const keys = Object.keys(result.data);
        expect(keys).toContain('id');
        expect(keys).toContain('roles');
        expect(keys).toContain('iat');
        expect(keys).toHaveLength(3);
      }
    });
  });

  describe('schema parse vs safeParse', () => {
    it('should throw error with parse() on invalid payload', () => {
      const invalidPayload = {
        id: 'invalid',
        roles: 'admin',
        iat: 'not-a-number',
      };

      expect(() => {
        authSchema.parse(invalidPayload);
      }).toThrow();
    });

    it('should not throw error with safeParse() on invalid payload', () => {
      const invalidPayload = {
        id: 'invalid',
        roles: 'admin',
        iat: 'not-a-number',
      };

      expect(() => {
        authSchema.safeParse(invalidPayload);
      }).not.toThrow();
    });

    it('should return success: true for valid payload with safeParse', () => {
      const validPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it('should return success: false for invalid payload with safeParse', () => {
      const invalidPayload = {
        id: 'invalid',
      };

      const result = authSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle negative iat values', () => {
      const payloadWithNegativeIat = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin'],
        iat: -1,
      };

      const result = authSchema.safeParse(payloadWithNegativeIat);

      expect(result.success).toBe(true);
    });

    it('should handle very long role names', () => {
      const longRoleName = 'a'.repeat(1000);
      const validPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: [longRoleName],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it('should handle many roles', () => {
      const manyRoles = Array.from({ length: 100 }, (_, i) => `role${i}`);
      const validPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: manyRoles,
        iat: 1688132800,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.roles).toHaveLength(100);
      }
    });

    it('should handle roles with unicode characters', () => {
      const validPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin', 'ユーザー', '管理者', 'مدير'],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it('should handle roles with whitespace', () => {
      const validPayload = {
        id: '12345678-1234-1234-1234-123456789012',
        roles: ['admin', 'super user', 'read write', ' leading space', 'trailing space '],
        iat: 1688132800,
      };

      const result = authSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });
  });
});
