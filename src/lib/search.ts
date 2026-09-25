const API_BASE = 'https://kumbaram-three.vercel.app/api/search'

export async function searchTicker(q: string, signal?: AbortSignal) {
  try {
    const res = await fetch(`${API_BASE}?q=${encodeURIComponent(q)}`, { signal })
    if (!res.ok) return []
    const data = await res.json()
    return data.quotes || []
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      throw err
    }
    return []
  }
}