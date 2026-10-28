import earcut from 'earcut'

/** Ring of [x, z] points in metres. rings[0] is the outer wall, any others are courtyards (holes). */
export type Ring = [number, number][]

export interface ExtrudedMesh {
  /** x,y,z triples, y up. */
  vertices: Float32Array
  /** Triangles wound so normals face out of the solid. */
  indices: Uint32Array
}

const EPS = 1e-3

function signedArea(ring: Ring): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i]
    const [x2, z2] = ring[(i + 1) % ring.length]
    a += x1 * z2 - x2 * z1
  }
  return a / 2
}

/** Drops the closing duplicate and repeated points. Returns a fresh array, or null if degenerate. */
function cleanRing(ring: Ring): Ring | null {
  const out: Ring = []
  for (const p of ring) {
    const prev = out[out.length - 1]
    if (!prev || Math.abs(prev[0] - p[0]) > EPS || Math.abs(prev[1] - p[1]) > EPS) out.push([p[0], p[1]])
  }
  if (out.length > 1) {
    const first = out[0]
    const last = out[out.length - 1]
    if (Math.abs(first[0] - last[0]) <= EPS && Math.abs(first[1] - last[1]) <= EPS) out.pop()
  }
  return out.length >= 3 && Math.abs(signedArea(out)) > EPS ? out : null
}

/**
 * Extrudes a footprint (with optional holes) from `base` up to `top` (metres) into a closed
 * triangle mesh for a Rapier trimesh. Returns null if the footprint is unusable.
 */
export function extrudePolygon(rings: Ring[], base: number, top: number): ExtrudedMesh | null {
  if (!(top > base)) return null

  // Normalise winding so wall normals face away from the solid:
  // outer ring area < 0, holes area > 0 (in the x,z plane).
  const clean: Ring[] = []
  for (let r = 0; r < rings.length; r++) {
    const ring = cleanRing(rings[r])
    if (!ring) {
      if (r === 0) return null
      continue // drop a bad hole, keep the building
    }
    const a = signedArea(ring)
    if (r === 0 ? a > 0 : a < 0) ring.reverse()
    clean.push(ring)
  }

  const flat: number[] = []
  const holeStarts: number[] = []
  const ringStart: number[] = []
  let n = 0
  clean.forEach((ring, r) => {
    if (r > 0) holeStarts.push(n)
    ringStart.push(n)
    for (const [x, z] of ring) flat.push(x, z)
    n += ring.length
  })

  const tris = earcut(flat, holeStarts.length ? holeStarts : undefined, 2)
  if (tris.length < 3) return null

  // Bottom vertices 0..n-1, top vertices n..2n-1.
  const verts = new Float32Array(n * 2 * 3)
  for (let i = 0; i < n; i++) {
    verts.set([flat[i * 2], base, flat[i * 2 + 1]], i * 3)
    verts.set([flat[i * 2], top, flat[i * 2 + 1]], (n + i) * 3)
  }

  const idx: number[] = []
  const hasFloor = base > 0.01 // a building on the ground doesn't need one

  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t]
    const b = tris[t + 1]
    const c = tris[t + 2]
    // Normal's y component, so the roof always faces up regardless of earcut's output winding.
    const ny =
      (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]) -
      (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1])
    if (Math.abs(ny) < 1e-9) continue // sliver
    if (ny > 0) {
      idx.push(a + n, b + n, c + n)
      if (hasFloor) idx.push(a, c, b)
    } else {
      idx.push(a + n, c + n, b + n)
      if (hasFloor) idx.push(a, b, c)
    }
  }

  // Walls: one quad per ring edge.
  clean.forEach((ring, r) => {
    const start = ringStart[r]
    for (let k = 0; k < ring.length; k++) {
      const i = start + k
      const j = start + ((k + 1) % ring.length)
      idx.push(i, j, j + n, i, j + n, i + n)
    }
  })

  return { vertices: verts, indices: Uint32Array.from(idx) }
}

/**
 * Stable key for dedupe. Buildings that straddle tile edges arrive as several clipped pieces with the
 * same feature id but different geometry, so the key includes a hash of the (quantised ~0.1 m) geometry.
 * Identical pieces returned twice collapse to one key; different pieces each get their own collider.
 */
export function featureKey(
  id: string | number | undefined | null,
  polygon: number[][][],
  height: number,
  base: number,
): string {
  let h = 0x811c9dc5
  const mix = (v: number) => {
    h ^= v | 0
    h = Math.imul(h, 0x01000193)
  }
  mix(Math.round(height * 10))
  mix(Math.round(base * 10))
  for (const ring of polygon) {
    mix(ring.length)
    for (const p of ring) {
      mix(Math.round(p[0] * 1e6))
      mix(Math.round(p[1] * 1e6))
    }
  }
  return `${id ?? 'x'}:${(h >>> 0).toString(36)}`
}
