let guard: (() => Promise<boolean>) | null = null
export function setNavigationGuard(next: (() => Promise<boolean>) | null) { guard = next }
export async function mayNavigate() { return guard ? guard() : true }
