import { useEffect, useRef, useState } from 'react'

// Wrap any angle into 0..359.99
const norm = (deg) => ((deg % 360) + 360) % 360

const TICKS = Array.from({ length: 36 }, (_, i) => i * 10) // a tick every 10°
const LETTERS = [['N', 0], ['E', 90], ['S', 180], ['W', 270]]

const panel = {
  position: 'absolute', top: 16, right: 16, zIndex: 5,
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  padding: 8, borderRadius: 10,
  background: 'rgba(14, 20, 27, 0.92)', border: '1px solid #243240',
  color: '#e8edf2', font: '13px ui-monospace, Menlo, Consolas, monospace',
}
const row = { display: 'flex', alignItems: 'center', gap: 6 }
const btn = {
  font: 'inherit', color: '#e8edf2', background: '#162029',
  border: '1px solid #243240', borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
}

export default function Compass({ map }) {
  const [bearing, setBearing] = useState(0)
  const [zoom, setZoom] = useState(0)
  const [draft, setDraft] = useState(null) // text being typed in the degrees box
  const svgRef = useRef(null)
  const drag = useRef(null)

  // Keep our numbers in step with the map's camera.
  useEffect(() => {
    if (!map) return
    const sync = () => {
      setBearing(map.getBearing())
      setZoom(map.getZoom())
    }
    sync()
    map.on('move', sync)
    return () => map.off('move', sync)
  }, [map])

  if (!map) return null

  // Angle of the pointer around the dial's centre: 0° = straight up, increasing clockwise.
  const angleAt = (e) => {
    const r = svgRef.current.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    return (Math.atan2(dx, -dy) * 180) / Math.PI
  }

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startAngle: angleAt(e), startBearing: map.getBearing() }
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    // How far the pointer has swept around the dial since the grab (-180..180).
    const turned = norm(angleAt(e) - drag.current.startAngle + 180) - 180
    // Turning the dial clockwise means the map's bearing goes DOWN.
    map.setBearing(drag.current.startBearing - turned)
  }
  const onPointerUp = () => { drag.current = null }

  const degrees = Math.round(norm(bearing)) % 360

  const applyDraft = () => {
    const v = parseFloat(draft)
    if (Number.isFinite(v)) map.easeTo({ bearing: norm(v), duration: 300 })
    setDraft(null)
  }

  return (
    <div style={panel}>
      <svg
        ref={svgRef}
        viewBox="-64 -64 128 128"
        width="128"
        height="128"
        style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <circle r="57" fill="#0e141b" stroke="#243240" />

        {/* The dial: spins opposite to the map so N always points to true north */}
        <g transform={`rotate(${-bearing})`}>
          {TICKS.map((a) => (
            <line
              key={a}
              y1="-55"
              y2={a % 90 === 0 ? -45 : a % 30 === 0 ? -49 : -52}
              stroke={a === 0 ? '#ff5a4d' : '#8fa0b1'}
              strokeWidth={a === 0 ? 2.5 : a % 30 === 0 ? 1.5 : 1}
              transform={`rotate(${a})`}
            />
          ))}
          {LETTERS.map(([letter, a]) => (
            <text
              key={letter}
              transform={`rotate(${a}) translate(0 -34) rotate(${-a})`}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="14"
              fontWeight="600"
              fill={letter === 'N' ? '#ff5a4d' : '#e8edf2'}
            >
              {letter}
            </text>
          ))}
        </g>

        {/* Fixed marker at the top: the direction your screen is facing */}
        <polygon points="0,-62 -5,-54 5,-54" fill="#ffb000" />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="15"
          fill="#e8edf2"
          style={{ pointerEvents: 'none' }}
        >
          {degrees}°
        </text>
      </svg>

      <div style={row}>
        <input
          type="number"
          step="1"
          value={draft ?? degrees}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={applyDraft}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          style={{
            width: 62, font: 'inherit', color: '#e8edf2', background: '#162029',
            border: '1px solid #243240', borderRadius: 4, padding: '4px 6px',
          }}
        />
        <span>°</span>
        <button style={btn} onClick={() => map.easeTo({ bearing: 0, duration: 300 })}>
          North
        </button>
      </div>

      <div style={row}>
        <button style={btn} onClick={() => map.zoomOut()}>−</button>
        <span style={{ minWidth: 46, textAlign: 'center' }}>{zoom.toFixed(2)}</span>
        <button style={btn} onClick={() => map.zoomIn()}>+</button>
      </div>
    </div>
  )
}
