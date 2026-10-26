import { features } from './features';

/** How a role reads on screen. Without the Editor role, partners are "Member" and viewers "View only". */
export function roleLabel(role: string) {
  if (features.editorRole || role === 'owner') return role.charAt(0).toUpperCase() + role.slice(1);
  return role === 'partner' ? 'Member' : role === 'viewer' ? 'View only' : role === 'editor' ? 'Editor' : role;
}

/** What to call a shared group: with one home per person, it is the home. */
export const groupNoun = features.multipleHomes ? 'group' : 'home';
