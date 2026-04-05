import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import {
  CrudOperation,
  RoleGate,
  RuntimeAuthorizationConfig,
  RuntimeConfigService,
} from '../config/runtime-config';
import { LoggerService } from '../service/logger.service';
import { AuthenticationError } from './oidc-authentication.service';
import { getAuthenticatedPrincipal, getRequestId } from './request-context';

/**
 * Outcome of a single authorization decision.
 */
type AuthorizationVerdict = 'allowed' | 'denied';

/**
 * Fine-grained authorization service that enforces per-channel role
 * requirements configured via `config.authentication.authorization`.
 *
 * Authorization is required when authentication is enabled. If the service
 * is invoked without a configured authorization section, an internal server
 * error is thrown to prevent accidental unrestricted access.
 *
 * Role semantics:
 *  - `allow: ["*"]` — any authenticated principal is allowed (wildcard).
 *  - `allow: []`    — nobody is allowed (channel is completely locked).
 *  - `allow: ["role1", "role2"]` — principal must hold at least one listed role.
 *  - `deny: ["role3"]` — any principal holding a denied role is rejected,
 *    regardless of allow matches. Deny always overrides allow.
 */
@Injectable()
export class AuthorizationService {
  private readonly authorization: RuntimeAuthorizationConfig | undefined;
  private readonly authenticationEnabled: boolean;

  /**
   * Creates the authorization service from runtime config.
   */
  public constructor(
    private readonly runtimeConfig: RuntimeConfigService,
    private readonly logger: LoggerService,
  ) {
    this.authorization = this.runtimeConfig.getAuthorization();
    this.authenticationEnabled = this.runtimeConfig.getAuthentication().enabled;
  }

  /**
   * Enforces that the authenticated principal may access schema endpoints
   * (table-names, table info, describe).
   */
  public authorizeSchemaAccess(request: Request): void {
    if (!this.ensureAuthorizationConfigured()) {
      return;
    }

    this.evaluateGate(request, this.authorization!.schema, 'schema');
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
    if (!this.ensureAuthorizationConfigured()) {
      return;
    }

    const tableOverride = this.authorization!.crud.tables[table];
    const gate =
      tableOverride?.[operation] ?? this.authorization!.crud.default[operation];

    this.evaluateGate(request, gate, `crud:${operation} on "${table}"`);
  }

  /**
   * Evaluates a role gate against the current request principal.
   *
   * Deny always takes priority: if the principal holds any denied role, access
   * is rejected even if the principal also matches an allowed role.
   *
   * Every decision is logged with the request identifier, channel, verdict,
   * principal subject, and the specific reason for the outcome.
   */
  private evaluateGate(
    request: Request,
    gate: RoleGate,
    channel: string,
  ): void {
    const requestId = getRequestId(request);
    const principal = getAuthenticatedPrincipal(request);
    const subject = principal?.subject ?? 'anonymous';

    const deny = (
      verdict: AuthorizationVerdict,
      reason: string,
      hint: string,
    ): never => {
      this.logDecision(requestId, subject, channel, verdict, reason);
      throw new AuthenticationError(403, reason, hint);
    };

    if (gate.allow.includes('*') && gate.deny.length === 0) {
      this.logDecision(
        requestId,
        subject,
        channel,
        'allowed',
        'Wildcard allow with no deny rules.',
      );
      return;
    }

    if (!principal) {
      deny(
        'denied',
        `Authorization denied for ${channel}: no authenticated principal on request.`,
        'Ensure authentication is enabled and the request carries a valid bearer token.',
      );
    }

    if (gate.deny.length > 0) {
      const matchedDenyRole = principal.roles.find((role) =>
        gate.deny.includes(role),
      );

      if (matchedDenyRole) {
        deny(
          'denied',
          `Authorization denied for ${channel}: principal holds denied role "${matchedDenyRole}".`,
          `Remove the denied role from the caller or update config.authentication.authorization to adjust the deny list.`,
        );
      }
    }

    if (gate.allow.length === 0) {
      deny(
        'denied',
        `Authorization denied for ${channel}: this channel is locked.`,
        'No roles are configured for this channel. Update config.authentication.authorization to allow access.',
      );
    }

    if (gate.allow.includes('*')) {
      this.logDecision(
        requestId,
        subject,
        channel,
        'allowed',
        'Wildcard allow and principal is not denied.',
      );
      return;
    }

    if (!principal.roles.some((role) => gate.allow.includes(role))) {
      deny(
        'denied',
        `Authorization denied for ${channel}: principal lacks a required role.`,
        `Grant one of the following roles to the caller: ${gate.allow.join(', ')}.`,
      );
    }

    const matchedRoles = principal.roles.filter((role) =>
      gate.allow.includes(role),
    );

    this.logDecision(
      requestId,
      subject,
      channel,
      'allowed',
      `Principal holds allowed role(s): ${matchedRoles.join(', ')}.`,
    );
  }

  private logDecision(
    requestId: string,
    subject: string,
    channel: string,
    verdict: AuthorizationVerdict,
    reason: string,
  ): void {
    this.logger.log(
      `[${requestId}] authorization ${verdict} for "${subject}" on ${channel}: ${reason}`,
    );
  }

  /**
   * Verifies the authorization section is present when authentication is
   * enabled. When authentication is disabled, authorization checks are
   * skipped entirely because all endpoints are public.
   *
   * Throws an internal server error when authentication is on but
   * the authorization section is missing, preventing silent fallback to
   * unrestricted access.
   *
   * @returns `true` when authorization should be evaluated, `false` when
   *  authentication is disabled and checks should be skipped.
   */
  private ensureAuthorizationConfigured(): boolean {
    if (!this.authenticationEnabled) {
      return false;
    }

    if (!this.authorization) {
      throw new AuthenticationError(
        500,
        'Authorization is not configured but was invoked.',
        'Add an authorization section to the runtime config when authentication is enabled.',
      );
    }

    return true;
  }
}
