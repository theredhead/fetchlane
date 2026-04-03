import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import {
  CrudOperation,
  RuntimeAuthorizationConfig,
  RuntimeConfigService,
} from '../config/runtime-config';
import { AuthError } from './oidc-auth.service';
import { getAuthenticatedPrincipal } from './request-context';

/**
 * Fine-grained authorization service that enforces per-channel role
 * requirements configured via `config.auth.authorization`.
 *
 * When authorization is not configured, all checks are no-ops and every
 * authenticated user has unrestricted access (backward-compatible).
 *
 * Role semantics:
 *  - `["*"]` — any authenticated principal is allowed (wildcard).
 *  - `[]`    — nobody is allowed (channel is completely locked).
 *  - `["role1", "role2"]` — principal must hold at least one listed role.
 */
@Injectable()
export class AuthorizationService {
  private readonly authorization: RuntimeAuthorizationConfig | undefined;

  /**
   * Creates the authorization service from runtime config.
   */
  public constructor(private readonly runtimeConfig: RuntimeConfigService) {
    this.authorization = this.runtimeConfig.getAuthorization();
  }

  /**
   * Enforces that the authenticated principal may access schema endpoints
   * (table-names, table info, describe).
   */
  public authorizeSchemaAccess(request: Request): void {
    if (!this.authorization) {
      return;
    }

    this.requireRole(request, this.authorization.schema, 'schema');
  }

  /**
   * Enforces that the authenticated principal may create tables.
   */
  public authorizeCreateTable(request: Request): void {
    if (!this.authorization) {
      return;
    }

    this.requireRole(request, this.authorization.create_table, 'create_table');
  }

  /**
   * Enforces that the authenticated principal may perform a CRUD operation
   * on the given table.
   *
   * Table-specific overrides take precedence. When a table override does not
   * define a particular operation, the default CRUD roles apply.
   */
  public authorizeCrud(
    request: Request,
    table: string,
    operation: CrudOperation,
  ): void {
    if (!this.authorization) {
      return;
    }

    const tableOverride = this.authorization.crud.tables[table];
    const allowedRoles =
      tableOverride?.[operation] ?? this.authorization.crud.default[operation];

    this.requireRole(request, allowedRoles, `crud:${operation} on "${table}"`);
  }

  /**
   * Checks whether the principal on the request holds at least one of the
   * required roles. Throws a 403 `AuthError` when the check fails.
   */
  private requireRole(
    request: Request,
    allowedRoles: string[],
    channel: string,
  ): void {
    if (allowedRoles.includes('*')) {
      return;
    }

    const principal = getAuthenticatedPrincipal(request);

    if (!principal) {
      throw new AuthError(
        403,
        `Authorization denied for ${channel}: no authenticated principal on request.`,
        'Ensure authentication is enabled and the request carries a valid bearer token.',
      );
    }

    if (allowedRoles.length === 0) {
      throw new AuthError(
        403,
        `Authorization denied for ${channel}: this channel is locked.`,
        'No roles are configured for this channel. Update config.auth.authorization to allow access.',
      );
    }

    if (!principal.roles.some((role) => allowedRoles.includes(role))) {
      throw new AuthError(
        403,
        `Authorization denied for ${channel}: principal lacks a required role.`,
        `Grant one of the following roles to the caller: ${allowedRoles.join(', ')}.`,
      );
    }
  }
}
