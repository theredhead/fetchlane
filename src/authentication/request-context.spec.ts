import { Request } from 'express';
import {
  getRequestContext,
  getRequestId,
  setAuthenticatedPrincipal,
  getAuthenticatedPrincipal,
  FetchlaneRequest,
} from './request-context';

describe('request-context', () => {
  function bareRequest(): Request {
    return {} as unknown as Request;
  }

  describe('getRequestContext', () => {
    it('creates and attaches a new context when none exists', () => {
      const request = bareRequest();
      const context = getRequestContext(request);

      expect(context).toBeDefined();
      expect(context.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(context.principal).toBeNull();
    });

    it('returns the same context on subsequent calls', () => {
      const request = bareRequest();
      const first = getRequestContext(request);
      const second = getRequestContext(request);

      expect(first).toBe(second);
    });

    it('returns a pre-existing context without overwriting it', () => {
      const request = bareRequest() as FetchlaneRequest;
      request.fetchlaneContext = {
        requestId: 'existing-id',
        principal: null,
      };

      const context = getRequestContext(request);

      expect(context.requestId).toBe('existing-id');
    });
  });

  describe('getRequestId', () => {
    it('returns the UUID from the request context', () => {
      const request = bareRequest();
      const id = getRequestId(request);

      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('setAuthenticatedPrincipal / getAuthenticatedPrincipal', () => {
    it('stores and retrieves the principal', () => {
      const request = bareRequest();
      const principal = {
        subject: 'user-1',
        roles: ['admin'],
        claims: { sub: 'user-1' },
      };

      setAuthenticatedPrincipal(request, principal);
      const result = getAuthenticatedPrincipal(request);

      expect(result).toEqual(principal);
    });

    it('returns null when no principal has been set', () => {
      const request = bareRequest();
      const result = getAuthenticatedPrincipal(request);

      expect(result).toBeNull();
    });
  });
});
