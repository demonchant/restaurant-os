# Staff administration API

All responses use the standard `{ data, requestId }` envelope. Except invitation acceptance/MFA completion, endpoints require the secure staff session. Every state-changing authenticated route also requires the session-bound CSRF header and JSON content type.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/staff` | List visible tenant/location-scoped staff |
| GET | `/api/v1/staff/:staffId` | Read one visible staff identity |
| GET | `/api/v1/roles` | Read tenant roles |
| GET | `/api/v1/permissions` | Read the immutable permission registry |
| POST | `/api/v1/staff/invitations` | Invite staff with permitted roles and scope |
| POST | `/api/v1/staff/invitations/:invitationId/revoke` | Revoke a manageable pending invitation |
| POST | `/api/v1/staff/invitations/accept` | Consume invitation and set a compliant password |
| POST | `/api/v1/staff/invitations/complete-mfa` | Activate a privileged invite after TOTP enrollment |
| PATCH | `/api/v1/staff/:staffId` | Update display name and authorized scope |
| POST | `/api/v1/staff/:staffId/suspend` | Suspend and revoke sessions |
| POST | `/api/v1/staff/:staffId/reactivate` | Reactivate an eligible identity |
| POST | `/api/v1/staff/:staffId/roles` | Assign one permitted role |
| DELETE | `/api/v1/staff/:staffId/roles/:roleId` | Remove a role while retaining at least one |
| GET | `/api/v1/staff/:staffId/sessions` | List a manageable staff member's sessions |
| POST | `/api/v1/staff/:staffId/sessions/:sessionId/revoke` | Revoke one session |
| POST | `/api/v1/staff/:staffId/sessions/revoke-all` | Revoke all sessions |
| POST | `/api/v1/staff/mfa/enrollment` | Begin self-service TOTP enrollment |
| POST | `/api/v1/staff/mfa/enrollment/complete` | Verify enrollment and revoke existing sessions |

Mutation bodies are strict. Role assignment accepts only `{ roleId }`; invitation accepts email, display name, role IDs, access scope, and location IDs. Tenant and permissions cannot be submitted. Cross-tenant or higher-rank targeting returns a safe denial without exposing the target. Invitation tokens and MFA secrets appear only in their one-time user ceremony and are never logged.
