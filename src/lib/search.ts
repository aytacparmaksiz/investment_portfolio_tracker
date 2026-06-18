const API_BASE = 'https://kumbaram-three.vercel.app/api/search'

export async function searchTicker(q: string) {
  try {
    const res = await fetch(`${API_BASE}?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    return data.quotes || []
  } catch {
    return []
  }
}