import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthorizationService } from './authorization.service';
import { RuntimeConfigService } from '../config/runtime-config';
import { AuthenticationError } from './oidc-authentication.service';
import { Request } from 'express';
import { setAuthenticatedPrincipal } from './request-context';

function createMockRequest(): Request {
  return { fetchlaneContext: { principal: null } } as unknown as Request;
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

const fullAuthorization = {
  schema: ['admin', 'schema-viewer'],
  createTable: ['admin'],
  crud: {
    default: {
      create: ['admin', 'editor'],
      read: ['admin', 'editor', 'viewer'],
      update: ['admin', 'editor'],
      delete: ['admin'],
    },
    tables: {
      audit_log: {
        read: ['admin', 'auditor'],
        create: [],
        update: [],
        delete: [],
      },
      public_data: {
        read: ['*'],
      },
    },
  },
};

describe('AuthorizationService', () => {
  describe('when authorization is not configured', () => {
    let service: AuthorizationService;

    beforeEach(() => {
      service = new AuthorizationService(buildRuntimeConfigService(undefined));
    });

    it('allows schema access without any checks', () => {
      const request = createMockRequest();
      expect(() => service.authorizeSchemaAccess(request)).not.toThrow();
    });

    it('allows create table without any checks', () => {
      const request = createMockRequest();
      expect(() => service.authorizeCreateTable(request)).not.toThrow();
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

  describe('create table access', () => {
    let service: AuthorizationService;

    beforeEach(() => {
      service = new AuthorizationService(
        buildRuntimeConfigService(fullAuthorization),
      );
    });

    it('allows when principal has the admin role', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() => service.authorizeCreateTable(request)).not.toThrow();
    });

    it('denies when principal lacks the required role', () => {
      const request = createAuthenticatedRequest(['editor']);
      expect(() => service.authorizeCreateTable(request)).toThrow(
        AuthenticationError,
      );
    });

    it('denies when there is no authenticated principal', () => {
      const request = createMockRequest();
      expect(() => service.authorizeCreateTable(request)).toThrow(
        AuthenticationError,
      );
    });
  });

  describe('CRUD default roles', () => {
    let service: AuthorizationService;

    beforeEach(() => {
      service = new AuthorizationService(
        buildRuntimeConfigService(fullAuthorization),
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
          schema: [],
          createTable: [],
          crud: {
            default: {
              create: [],
              read: [],
              update: [],
              delete: [],
            },
            tables: {},
          },
        }),
      );
    });

    it('denies schema access even for admin', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() => service.authorizeSchemaAccess(request)).toThrow(/locked/);
    });

    it('denies create table even for admin', () => {
      const request = createAuthenticatedRequest(['admin']);
      expect(() => service.authorizeCreateTable(request)).toThrow(/locked/);
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

    it('includes allowed roles in the hint', () => {
      const request = createAuthenticatedRequest(['viewer']);
      try {
        service.authorizeCreateTable(request);
        expect.fail('Expected AuthenticationError');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect((error as AuthenticationError).hint).toContain('admin');
      }
    });
  });
});
