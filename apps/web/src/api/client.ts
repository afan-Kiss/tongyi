const API_V1 = '/api/v1'

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_V1}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = await res.json()
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `请求失败 ${res.status}`)
  }
  return data
}

export async function upload(path: string, formData: FormData) {
  const res = await fetch(`${API_V1}${path}`, { method: 'POST', body: formData })
  const data = await res.json()
  if (!res.ok || !data.ok) throw new Error(data.message || '上传失败')
  return data
}
