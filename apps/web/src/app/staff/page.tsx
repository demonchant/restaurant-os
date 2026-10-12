'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { api, ApiClientError } from '../../lib/api-client';

const role = z.object({ id: z.string(), code: z.string(), name: z.string(), rank: z.number(), description: z.string(), permissions: z.array(z.string()), tenantId: z.string() });
const staff = z.object({ id: z.string(), email: z.string(), displayName: z.string(), status: z.string(), accessScope: z.string(), locationIds: z.array(z.string()), roles: z.array(role), mfaRequired: z.boolean(), tenantId: z.string(), phone: z.string().nullable(), invitationId: z.string().nullable(), createdAt: z.coerce.date() });
const me = z.object({ userId: z.string(), tenantId: z.string(), kind: z.string(), assuranceLevel: z.number(), permissions: z.array(z.string()), roleCodes: z.array(z.string()), locationScope: z.string().nullable(), locationIds: z.array(z.string()) });
const ok = z.record(z.string(), z.unknown());

export default function StaffAdministrationPage() {
  const [people, setPeople] = useState<z.infer<typeof staff>[]>([]);
  const [roles, setRoles] = useState<z.infer<typeof role>[]>([]);
  const [allowed, setAllowed] = useState(new Set<string>());
  const [actorId, setActorId] = useState('');
  const [actorRank, setActorRank] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('');
  const explain = (error: unknown) => error instanceof ApiClientError ? error.message : 'The staff service is unavailable.';

  const load = useCallback(async () => {
    try {
      const identity = await api.get('/api/v1/auth/me', me);
      const [staffRows, roleRows] = await Promise.all([api.get('/api/v1/staff', z.array(staff)), api.get('/api/v1/roles', z.array(role))]);
      setAllowed(new Set(identity.permissions));
      setActorId(identity.userId);
      setActorRank(Math.max(0, ...roleRows.filter(({ code }) => identity.roleCodes.includes(code)).map(({ rank }) => rank)));
      setPeople(staffRows);
      setRoles(roleRows);
      setRoleId((current) => current || roleRows.find(({ code }) => code === 'FOH')?.id || '');
    } catch (error) { setMessage(explain(error)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rankOf = (person: z.infer<typeof staff>) => Math.max(0, ...person.roles.map(({ rank }) => rank));
  const manageable = (person: z.infer<typeof staff>) => person.id !== actorId && rankOf(person) < actorRank;
  const grantable = roles.filter(({ code, rank }) => code !== 'OWNER' && rank < actorRank);

  async function invite(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      await api.post('/api/v1/staff/invitations', { email, displayName: name, roleIds: [roleId], accessScope: 'TENANT', locationIds: [] }, z.object({ invitationId: z.string(), expiresAt: z.coerce.date() }));
      setEmail(''); setName(''); setMessage('Invitation delivered securely.'); await load();
    } catch (error) { setMessage(explain(error)); } finally { setBusy(false); }
  }
  async function post(path: string, confirmation: string, payload: unknown = {}) {
    if (!window.confirm(confirmation)) return;
    setBusy(true);
    try { await api.post(path, payload, ok); await load(); } catch (error) { setMessage(explain(error)); } finally { setBusy(false); }
  }
  async function remove(staffId: string, roleIdToRemove: string, code: string) {
    if (!window.confirm(`Remove the ${code} role? Existing sessions will be revoked.`)) return;
    setBusy(true);
    try { await api.delete(`/api/v1/staff/${staffId}/roles/${roleIdToRemove}`, ok); await load(); } catch (error) { setMessage(explain(error)); } finally { setBusy(false); }
  }

  return <main><section className="admin-shell" aria-labelledby="staff-title">
    <p className="eyebrow">Restaurant OS administration</p><h1 id="staff-title">Staff access</h1>
    <p>Roles and status are enforced by the server. Authorization changes revoke active sessions.</p>
    {message ? <p className="form-message" role="status">{message}</p> : null}
    {allowed.has('staff:create') ? <form onSubmit={invite}><h2>Invite staff</h2>
      <label htmlFor="staff-name">Display name</label><input id="staff-name" value={name} onChange={(event) => setName(event.target.value)} required />
      <label htmlFor="staff-email">Work email</label><input id="staff-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <label htmlFor="staff-role">Initial role</label><select id="staff-role" value={roleId} onChange={(event) => setRoleId(event.target.value)} required>{grantable.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <button disabled={busy}>Send secure invitation</button></form> : null}
    <div className="staff-list">{people.map((person) => <article className="staff-card" key={person.id}>
      <div><h2>{person.displayName}</h2><p>{person.email} · {person.status}</p><p>{person.roles.map(({ name: roleName }) => roleName).join(', ') || 'No role'} · {person.accessScope.toLowerCase()} scope</p></div>
      {manageable(person) ? <div className="staff-actions">
        {allowed.has('staff:create') && person.invitationId ? <button className="danger" disabled={busy} onClick={() => void post(`/api/v1/staff/invitations/${person.invitationId}/revoke`, `Revoke the invitation for ${person.displayName}?`)}>Revoke invitation</button> : null}
        {allowed.has('staff:suspend') && person.status === 'ACTIVE' ? <button className="danger" disabled={busy} onClick={() => void post(`/api/v1/staff/${person.id}/suspend`, `Suspend ${person.displayName} and revoke their sessions?`)}>Suspend</button> : null}
        {allowed.has('staff:suspend') && person.status === 'SUSPENDED' ? <button disabled={busy} onClick={() => void post(`/api/v1/staff/${person.id}/reactivate`, `Reactivate ${person.displayName}?`)}>Reactivate</button> : null}
        {allowed.has('staff:roles:assign') ? <><label htmlFor={`role-${person.id}`}>Add role</label><select id={`role-${person.id}`} defaultValue="" onChange={(event) => { if (event.target.value) void post(`/api/v1/staff/${person.id}/roles`, `Assign this role to ${person.displayName}?`, { roleId: event.target.value }); }}><option value="">Choose…</option>{grantable.filter((candidate) => !person.roles.some(({ id }) => id === candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>{person.roles.filter(({ code, rank }) => code !== 'OWNER' && rank < actorRank).map((assigned) => <button className="secondary" key={assigned.id} disabled={busy} onClick={() => void remove(person.id, assigned.id, assigned.code)}>Remove {assigned.code}</button>)}</> : null}
        {allowed.has('staff:sessions:revoke') ? <button className="secondary" disabled={busy} onClick={() => void post(`/api/v1/staff/${person.id}/sessions/revoke-all`, `Revoke every session for ${person.displayName}?`)}>Revoke sessions</button> : null}
      </div> : <p>Read-only: equal or higher authority.</p>}
    </article>)}</div>
  </section></main>;
}
