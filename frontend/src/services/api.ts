export type ApiErrorBody = { error?: { code?: string; message?: string } };

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });

  // 尽量解析 JSON（有些错误可能不是 JSON）
  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg =
      (data as ApiErrorBody)?.error?.message ||
      `请求失败 (${res.status})`;
    const code =
      (data as ApiErrorBody)?.error?.code ||
      "HTTP_ERROR";
    throw new ApiError(res.status, code, msg);
  }

  return (data ?? {}) as T;
}