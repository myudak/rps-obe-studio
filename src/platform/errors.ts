export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) { super(message); this.name = "ApiError"; this.status = status; this.code = code }
}

export function errorMessage(body: unknown, status: number): string {
  if (typeof body === "string" && body.trim() && !body.trim().startsWith("<")) return body.slice(0, 1000)
  if (body && typeof body === "object") {
    const value = body as Record<string, unknown>
    if (typeof value.message === "string") return value.message
    if (value.error !== undefined && value.error !== body) return errorMessage(value.error, status)
  }
  return status === 401 ? "Email/password tidak sesuai atau sesi telah berakhir." : status === 403 ? "Anda tidak memiliki akses untuk tindakan ini." : status >= 500 ? "Server sedang bermasalah. Coba lagi beberapa saat." : `Permintaan gagal (${status}).`
}
