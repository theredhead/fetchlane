import { AuthorizationService } from './authorization.service';
import { RoleGate, RuntimeConfigService } from '../config/runtime-config';
import { AuthenticationError } from './oidc-authentication.service';
import { LoggerService } from '../service/logger.service';
import { Request } from 'express';
import { setAuthenticatedPrincipal } from './request-context';

function gate(allow: string[], deny: string[] = []): RoleGate {
  return { allow, deny };
}

function createMockRequest(): Request {
  return {
    fetchlaneContext: {
      requestId: 'test-request-id',
      principal: null,
    },
  } as unknown as Request;
}

function createAuthenticatedRequest(roles: string[]): Request {
  const request = createMockRequest();
  setAuthenticatedPrincipal(request, {
    subject: 'test-user',
    roles,
    claims: {},
  });
  return request;
}

function buildRuntimeConfigService(
  authorizationConfig: unknown,
): RuntimeConfigService {
  return {
    getAuthorization: vi.fn().mockReturnValue(authorizationConfig),
  } as unknown as RuntimeConfigService;
}

function createMockLogger(): LoggerService {
  return { log: vi.fn() } as unknown as LoggerService;
}

const fullAuthorization = {
  schema: gate(['admin', 'schema-viewer']),
  crud: {
    default: {
      create: gate(['admin', 'editor']),
      read: gate(['admin', 'editor', 'viewer']),
      update: gate(['admin', 'editor']),
      delete: gate(['admin']),
    },
    tables: {
      audit_log: {
        read: gate(['admin', 'auditor']),
        create: gate([]),
        update: gate([]),
        delete: gate([]),
      },
      public_data: {
        read: gate(['*']),
      },
    },
  },
};

describe('AuthorizationService', () => {
  let mockLogger: LoggerService;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe('when authorization is not configured', () => {
    let service: AuthorizationService;

    beforeEach(() => {
      service = new AuthorizationService(
        buildRuntimeConfigService(undefined),
        mockLogger,
      );
    });

    it('allows schema access without any checks', () => {
      const request = createMockRequest();
      expect(() => service.authorizeSchemaAccess(request)).not.toThrow();
    });

    it('allows CRUD operations without any checks', () => {
      const request = createMockRequest();
      expect(() =>
        service.authorizeCrud(request, 'member', 'read'),
      ).not.toThrow();
    });
  });

  describe('schema access', () => {
    let service: AuthorizationService;

    beforeEach(() => {
      service = new AuthorizationService(
        buildRuntimeConfigService(fullAuthorization),
        mockLogger,
      );
    });

    it('allows when principal has a matching role', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() => service.authorizeSchemaAccess(request)).not.toThrow();
    });

    it('allows when principal has one of several matching roles', () => {
      const request = createAuthenticatedRequest(['schema-viewer']);
      expect(() => service.authorizeSchemaAccess(request)).not.toThrow();
    });

    it('denies when principal lacks all required roles', () => {
      const request = createAuthenticatedRequest(['editor']);
      expect(() => service.authorizeSchemaAccess(request)).toThrow(
        AuthenticationError,
      );
      expect(() => service.authorizeSchemaAccess(request)).toThrow(
        /lacks a required role/,
      );
    });

    it('denies when there is no authenticated principal', () => {
      const request = createMockRequest();
      expect(() => service.authorizeSchemaAccess(request)).toThrow(
        AuthenticationError,
      );
      expect(() => service.authorizeSchemaAccess(request)).toThrow(
        /no authenticated principal/,
      );
    });
  });

  describe('CRUD default roles', () => {
    let service: AuthorizationService;

    beforeEach(() => {
      service = new AuthorizationService(
        buildRuntimeConfigService(fullAuthorization),
        mockLogger,
      );
    });

    it('allows create when principal has the editor role', () => {
      const request = createAuthenticatedRequest(['editor']);
      expect(() =>
        service.authorizeCrud(request, 'member', 'create'),
      ).not.toThrow();
    });

    it('allows read when principal has the viewer role', () => {
      const request = createAuthenticatedRequest(['viewer']);
      expect(() =>
        service.authorizeCrud(request, 'member', 'read'),
      ).not.toThrow();
    });

    it('allows update when principal has the admin role', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() =>
        service.authorizeCrud(request, 'member', 'update'),
      ).not.toThrow();
    });

    it('allows delete when principal has the admin role', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() =>
        service.authorizeCrud(request, 'member', 'delete'),
      ).not.toThrow();
    });

    it('denies create when principal lacks matching role', () => {
      const request = createAuthenticatedRequest(['viewer']);
      expect(() => service.authorizeCrud(request, 'member', 'create')).toThrow(
        AuthenticationError,
      );
    });

    it('denies delete when principal lacks matching role', () => {
      const request = createAuthenticatedRequest(['editor']);
      expect(() => service.authorizeCrud(request, 'member', 'delete')).toThrow(
        AuthenticationError,
      );
    });

    it('denies when there is no authenticated principal', () => {
      const request = createMockRequest();
      expect(() => service.authorizeCrud(request, 'member', 'read')).toThrow(
        AuthenticationError,
      );
    });
  });

  describe('CRUD table-specific overrides', () => {
    let service: AuthorizationService;

    beforeEach(() => {
      service = new AuthorizationService(
        buildRuntimeConfigService(fullAuthorization),
        mockLogger,
      );
    });

    it('uses table-specific read roles for audit_log', () => {
      const request = createAuthenticatedRequest(['auditor']);
      expect(() =>
        service.authorizeCrud(request, 'audit_log', 'read'),
      ).not.toThrow();
    });

    it('denies audit_log read when principal has only default read roles', () => {
      const request = createAuthenticatedRequest(['viewer']);
      expect(() => service.authorizeCrud(request, 'audit_log', 'read')).toThrow(
        AuthenticationError,
      );
    });

    it('denies audit_log create because roles is empty (locked)', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() =>
        service.authorizeCrud(request, 'audit_log', 'create'),
      ).toThrow(AuthenticationError);
      expect(() =>
        service.authorizeCrud(request, 'audit_log', 'create'),
      ).toThrow(/locked/);
    });

    it('denies audit_log update because roles is empty (locked)', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() =>
        service.authorizeCrud(request, 'audit_log', 'update'),
      ).toThrow(/locked/);
    });

    it('denies audit_log delete because roles is empty (locked)', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() =>
        service.authorizeCrud(request, 'audit_log', 'delete'),
      ).toThrow(/locked/);
    });

    it('falls back to default for operations not overridden in table', () => {
      // public_data only overrides "read" — delete should fall back to default
      const request = createAuthenticatedRequest(['admin']);
      expect(() =>
        service.authorizeCrud(request, 'public_data', 'delete'),
      ).not.toThrow();
    });

    it('falls back to default for tables not listed in overrides', () => {
      const request = createAuthenticatedRequest(['editor']);
      expect(() =>
        service.authorizeCrud(request, 'unknown_table', 'create'),
      ).not.toThrow();
    });
  });

  describe('wildcard role ["*"]', () => {
    let service: AuthorizationService;

    beforeEach(() => {
      service = new AuthorizationService(
        buildRuntimeConfigService(fullAuthorization),
        mockLogger,
      );
    });

    it('allows any authenticated user to read public_data', () => {
      const request = createAuthenticatedRequest(['some-random-role']);
      expect(() =>
        service.authorizeCrud(request, 'public_data', 'read'),
      ).not.toThrow();
    });

    it('allows wildcard even with an empty roles array', () => {
      const request = createAuthenticatedRequest([]);
      expect(() =>
        service.authorizeCrud(request, 'public_data', 'read'),
      ).not.toThrow();
    });

    it('allows wildcard even without a principal on the request', () => {
      // Wildcard means "any" — the check short-circuits before looking at the principal
      const request = createMockRequest();
      expect(() =>
        service.authorizeCrud(request, 'public_data', 'read'),
      ).not.toThrow();
    });
  });

  describe('all channels locked (empty role arrays)', () => {
    let service: AuthorizationService;

    beforeEach(() => {
      service = new AuthorizationService(
        buildRuntimeConfigService({
          schema: gate([]),
          crud: {
            default: {
              create: gate([]),
              read: gate([]),
              update: gate([]),
              delete: gate([]),
            },
            tables: {},
          },
        }),
        mockLogger,
      );
    });

    it('denies schema access even for admin', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() => service.authorizeSchemaAccess(request)).toThrow(/locked/);
    });

    it('denies all CRUD operations', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() =>
        service.authorizeCrud(request, 'any_table', 'create'),
      ).toThrow(/locked/);
      expect(() => service.authorizeCrud(request, 'any_table', 'read')).toThrow(
        /locked/,
      );
      expect(() =>
        service.authorizeCrud(request, 'any_table', 'update'),
      ).toThrow(/locked/);
      expect(() =>
        service.authorizeCrud(request, 'any_table', 'delete'),
      ).toThrow(/locked/);
    });
  });

  describe('AuthenticationError details', () => {
    let service: AuthorizationService;

    beforeEach(() => {
      service = new AuthorizationService(
        buildRuntimeConfigService(fullAuthorization),
        mockLogger,
      );
    });

    it('includes the channel name in the error message', () => {
      const request = createAuthenticatedRequest(['nobody']);
      try {
        service.authorizeSchemaAccess(request);
        expect.fail('Expected AuthenticationError');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect((error as AuthenticationError).message).toContain('schema');
        expect((error as AuthenticationError).statusCode).toBe(403);
      }
    });

    it('includes the table and operation in CRUD error message', () => {
      const request = createAuthenticatedRequest(['viewer']);
      try {
        service.authorizeCrud(request, 'member', 'delete');
        expect.fail('Expected AuthenticationError');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect((error as AuthenticationError).message).toContain('crud:delete');
        expect((error as AuthenticationError).message).toContain('"member"');
      }
    });
  });

  describe('deny overrides allow', () => {
    const denyAuthorization = {
      schema: gate(['admin', 'viewer'], ['blocked']),
      crud: {
        default: {
          create: gate(['admin', 'editor'], ['readonly']),
          read: gate(['*'], ['banned']),
          update: gate(['admin', 'editor']),
          delete: gate(['admin']),
        },
        tables: {
          sensitive: {
            read: gate(['admin'], ['intern']),
          },
        },
      },
    };

    let service: AuthorizationService;

    beforeEach(() => {
      service = new AuthorizationService(
        buildRuntimeConfigService(denyAuthorization),
        mockLogger,
      );
    });

    it('denies schema access when principal holds a denied role', () => {
      const request = createAuthenticatedRequest(['admin', 'blocked']);
      expect(() => service.authorizeSchemaAccess(request)).toThrow(
        AuthenticationError,
      );
      expect(() => service.authorizeSchemaAccess(request)).toThrow(
        /denied role/,
      );
    });

    it('allows schema access when principal has allowed role and no denied role', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() => service.authorizeSchemaAccess(request)).not.toThrow();
    });

    it('denies CRUD create when principal holds a denied role', () => {
      const request = createAuthenticatedRequest(['editor', 'readonly']);
      expect(() => service.authorizeCrud(request, 'member', 'create')).toThrow(
        /denied role/,
      );
    });

    it('allows CRUD create when principal has allowed role without denied role', () => {
      const request = createAuthenticatedRequest(['editor']);
      expect(() =>
        service.authorizeCrud(request, 'member', 'create'),
      ).not.toThrow();
    });

    it('denies wildcard read when principal holds a denied role', () => {
      const request = createAuthenticatedRequest(['banned']);
      expect(() => service.authorizeCrud(request, 'member', 'read')).toThrow(
        /denied role/,
      );
    });

    it('allows wildcard read when principal does not hold a denied role', () => {
      const request = createAuthenticatedRequest(['any-role']);
      expect(() =>
        service.authorizeCrud(request, 'member', 'read'),
      ).not.toThrow();
    });

    it('denies table-specific override when principal holds a denied role', () => {
      const request = createAuthenticatedRequest(['admin', 'intern']);
      expect(() => service.authorizeCrud(request, 'sensitive', 'read')).toThrow(
        /denied role/,
      );
    });

    it('allows table-specific override when principal has no denied role', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() =>
        service.authorizeCrud(request, 'sensitive', 'read'),
      ).not.toThrow();
    });

    it('falls back to default when table override has no deny for the operation', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() =>
        service.authorizeCrud(request, 'sensitive', 'delete'),
      ).not.toThrow();
    });
  });

  describe('audit logging', () => {
    let service: AuthorizationService;

    beforeEach(() => {
      service = new AuthorizationService(
        buildRuntimeConfigService(fullAuthorization),
        mockLogger,
      );
    });

    it('logs allowed decisions with request id and subject', () => {
      const request = createAuthenticatedRequest(['admin']);
      service.authorizeSchemaAccess(request);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('[test-request-id]'),
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('allowed'),
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('"test-user"'),
      );
    });

    it('logs denied decisions before throwing', () => {
      const request = createAuthenticatedRequest(['nobody']);

      expect(() => service.authorizeSchemaAccess(request)).toThrow(
        AuthenticationError,
      );

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('[test-request-id]'),
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('denied'),
      );
    });

    it('logs wildcard allow without principal lookup', () => {
      const request = createMockRequest();
      service.authorizeCrud(request, 'public_data', 'read');

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Wildcard allow'),
      );
    });

    it('logs deny-overrides-allow decisions', () => {
      const denyService = new AuthorizationService(
        buildRuntimeConfigService({
          schema: gate(['admin'], ['blocked']),
          createTable: gate(['admin']),
          crud: {
            default: {
              create: gate(['admin']),
              read: gate(['admin']),
              update: gate(['admin']),
              delete: gate(['admin']),
            },
            tables: {},
          },
        }),
        mockLogger,
      );

      const request = createAuthenticatedRequest(['admin', 'blocked']);
      expect(() => denyService.authorizeSchemaAccess(request)).toThrow(
        AuthenticationError,
      );

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('denied role'),
      );
    });
  });
});
