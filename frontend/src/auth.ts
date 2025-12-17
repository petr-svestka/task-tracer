export type AuthUser = {
  id: number;
  username: string;
  token: string;
  role?: 'student' | 'teacher';
};

export function getAuthUser(): AuthUser | null {
  const raw = localStorage.getItem('authUser');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}
