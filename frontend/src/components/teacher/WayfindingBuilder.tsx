// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// Multi-step scavenger-hunt authoring: a Leaflet map to drop/drag ordered
// stops, a per-stop editor, GPX import/export, and the capability ceiling
// that feeds the min() consent gate. See WAYFINDING_CONSENT_LADDER.md.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { WaypointInput } from '@/types/teacher'

const K = 'components_teacher_wayfindingbuilder'

type Mode = 'ordered' | 'free_choice' | 'guided_path'
type Ceiling = 'B' | 'C' | 'D' | 'E'

// Rungs D (live position to teacher) and E (breadcrumb track) are held until
// the continuous-tracking consent copy has a counsel review — see
// WAYFINDING_CONSENT_LADDER.md §7. The backend clamps any higher ceiling to C
// regardless; this just keeps the two options out of the builder. Flip to
// true (and re-review the copy) alongside the backend WAYFINDING_DE_ENABLED.
const DE_ENABLED = false
const CEILING_OPTIONS: Ceiling[] = DE_ENABLED ? ['B', 'C', 'D', 'E'] : ['B', 'C']
type RouteGeometry = { type: 'LineString'; coordinates: [number, number][] } | null

export interface WayfindingValue {
  discovery_wayfinding_enabled: boolean
  wayfinding_mode: Mode
  wayfinding_capability_ceiling: Ceiling
  route_geometry: RouteGeometry
  waypoints: WaypointInput[]
}

interface Props {
  activityId?: string
  value: WayfindingValue
  onChange: (v: WayfindingValue) => void
}

type TFn = (key: string, def: string) => string

const ceilingLabels = (t: TFn): Record<Ceiling, string> => ({
  B: t(`${K}.ceiling_b`, 'B — On-device navigation only (no location leaves the phone)'),
  C: t(`${K}.ceiling_c`, 'C — Also: tag submitted photos with where they were taken'),
  D: t(`${K}.ceiling_d`, 'D — Also: show students on your live map during the session'),
  E: t(`${K}.ceiling_e`, 'E — Also: record each student’s full walked path'),
})
const modeLabels = (t: TFn): Record<Mode, string> => ({
  ordered: t(`${K}.mode_ordered`, 'Ordered — stops must be reached in sequence'),
  free_choice: t(`${K}.mode_free`, 'Free choice — any order counts'),
  guided_path: t(`${K}.mode_guided`, 'Guided path — ordered, and the route line is the intended trail'),
})

function newWaypoint(lat: number, lng: number, index: number): WaypointInput {
  return {
    sequence_index: index,
    name: `Stop ${index + 1}`,
    clue_text: '',
    latitude: round6(lat),
    longitude: round6(lng),
    arrival_radius_meters: 25,
    symbol: null,
    required: true,
    capture_requirements: null,
    hint_unlock_rule: 'immediate',
    hint_unlock_minutes: null,
  }
}
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

// ── Client-side GPX parse (no dependency — DOMParser is built in) ────────────
function parseGpxText(xml: string): { waypoints: WaypointInput[]; route: RouteGeometry } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('That file isn’t valid GPX.')

  const readPts = (sel: string) =>
    Array.from(doc.querySelectorAll(sel))
      .map((el) => {
        const lat = parseFloat(el.getAttribute('lat') || '')
        const lon = parseFloat(el.getAttribute('lon') || '')
        if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
        const name = el.querySelector('name')?.textContent?.trim() || ''
        const desc =
          el.querySelector('desc')?.textContent?.trim() ||
          el.querySelector('cmt')?.textContent?.trim() ||
          ''
        return { lat, lon, name, desc }
      })
      .filter(Boolean) as { lat: number; lon: number; name: string; desc: string }[]

  let pts = readPts('wpt')
  const rtePts = readPts('rte rtept')
  const trkPts = readPts('trk trkseg trkpt')
  if (pts.length === 0) pts = rtePts.length ? rtePts : trkPts

  if (pts.length === 0) throw new Error('No waypoints or route points found in that GPX file.')

  const line = (trkPts.length ? trkPts : rtePts).map((p) => [round6(p.lon), round6(p.lat)] as [number, number])
  return {
    waypoints: pts.slice(0, 200).map((p, i) => ({
      ...newWaypoint(p.lat, p.lon, i),
      name: p.name || `Stop ${i + 1}`,
      clue_text: p.desc || '',
    })),
    route: line.length >= 2 ? { type: 'LineString', coordinates: line } : null,
  }
}

export default function WayfindingBuilder({ activityId, value, onChange }: Props) {
  const { t } = useTranslation()
  const CEILING_LABELS = ceilingLabels(t)
  const MODE_LABELS = modeLabels(t)
  const mapRef = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markerLayer = useRef<L.LayerGroup | null>(null)
  const lineLayer = useRef<L.LayerGroup | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [gpxError, setGpxError] = useState<string>('')
  const [exporting, setExporting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const wps = value.waypoints
  const set = (patch: Partial<WayfindingValue>) => onChange({ ...value, ...patch })
  const setWps = (next: WaypointInput[]) =>
    set({ waypoints: next.map((w, i) => ({ ...w, sequence_index: i })) })

  const center = useMemo<[number, number]>(() => {
    if (wps.length) return [wps[0].latitude, wps[0].longitude]
    return [39.8283, -98.5795] // continental US
  }, [wps])

  // ── Map init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || map.current || !value.discovery_wayfinding_enabled) return
    const m = L.map(mapRef.current).setView(center, wps.length ? 15 : 4)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(m)
    markerLayer.current = L.layerGroup().addTo(m)
    lineLayer.current = L.layerGroup().addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => {
      setWpsRef.current([...wpsRef.current, newWaypoint(e.latlng.lat, e.latlng.lng, wpsRef.current.length)])
    })
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.discovery_wayfinding_enabled])

  // Give the click handler current data without re-binding it.
  const wpsRef = useRef(wps)
  const setWpsRef = useRef(setWps)
  useEffect(() => {
    wpsRef.current = wps
    setWpsRef.current = setWps
  })

  // ── Redraw markers + lines on change ─────────────────────────────────────
  useEffect(() => {
    if (!map.current || !markerLayer.current || !lineLayer.current) return
    markerLayer.current.clearLayers()
    lineLayer.current.clearLayers()

    wps.forEach((w, i) => {
      const icon = L.divIcon({
        className: 'wf-pin',
        html: `<div style="background:var(--primary,#2563eb);color:#fff;border-radius:999px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${i + 1}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })
      const marker = L.marker([w.latitude, w.longitude], { icon, draggable: true })
      marker.on('dragend', () => {
        const ll = marker.getLatLng()
        const next = [...wpsRef.current]
        next[i] = { ...next[i], latitude: round6(ll.lat), longitude: round6(ll.lng) }
        setWpsRef.current(next)
      })
      marker.bindTooltip(w.name || `Stop ${i + 1}`)
      marker.addTo(markerLayer.current!)
      L.circle([w.latitude, w.longitude], {
        radius: w.arrival_radius_meters || 25,
        color: 'var(--primary,#2563eb)',
        weight: 1,
        fillOpacity: 0.08,
      }).addTo(markerLayer.current!)
    })

    if (wps.length >= 2) {
      L.polyline(
        wps.map((w) => [w.latitude, w.longitude] as [number, number]),
        { color: 'var(--primary,#2563eb)', weight: 3 }
      ).addTo(lineLayer.current)
    }
    if (value.route_geometry && value.route_geometry.coordinates.length >= 2) {
      L.polyline(
        value.route_geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
        { color: '#6b7280', weight: 2, dashArray: '6 6' }
      ).addTo(lineLayer.current)
    }
  }, [wps, value.route_geometry])

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= wps.length) return
    const next = [...wps]
    ;[next[i], next[j]] = [next[j], next[i]]
    setWps(next)
  }
  const remove = (i: number) => setWps(wps.filter((_, k) => k !== i))
  const patchWp = (i: number, p: Partial<WaypointInput>) =>
    setWps(wps.map((w, k) => (k === i ? { ...w, ...p } : w)))
  const toggleCapture = (i: number, key: 'photo' | 'note') => {
    const cur = wps[i].capture_requirements || {}
    const nextReq = { ...cur, [key]: !cur[key] }
    patchWp(i, { capture_requirements: Object.values(nextReq).some(Boolean) ? nextReq : null })
  }

  const onGpxFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setGpxError('')
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setGpxError('GPX file too large (limit 5 MB).')
      return
    }
    try {
      const parsed = parseGpxText(await file.text())
      setWps(parsed.waypoints)
      set({
        waypoints: parsed.waypoints.map((w, i) => ({ ...w, sequence_index: i })),
        route_geometry: parsed.route,
        wayfinding_mode: parsed.route ? 'guided_path' : value.wayfinding_mode,
      })
    } catch (err: any) {
      setGpxError(err?.message || 'Could not read that GPX file.')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const exportGpx = async () => {
    if (!activityId) return
    setExporting(true)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/api/v1/activities/${activityId}/gpx`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(activityId || 'hunt').slice(0, 8)}.gpx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setGpxError('Export failed — save the activity first, then try again.')
    } finally {
      setExporting(false)
    }
  }

  const enabled = value.discovery_wayfinding_enabled

  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] p-3">
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            set({
              discovery_wayfinding_enabled: e.target.checked,
              wayfinding_capability_ceiling: e.target.checked
                ? value.wayfinding_capability_ceiling || 'B'
                : value.wayfinding_capability_ceiling,
            })
          }
          style={{ width: 16, height: 16 }}
        />
        <span style={{ fontWeight: 600 }}>
          {t(`${K}.enable`, '🧭 Multi-step scavenger hunt (map + route)')}
        </span>
      </label>
      <p className="text-xs text-[var(--text-muted)] mt-1" style={{ marginLeft: 26 }}>
        {t(
          `${K}.enable_help`,
          'Students get a map with the stops, live distance and a bearing arrow. Navigation is resolved on the phone — no location leaves the device unless you raise the capability below.'
        )}
      </p>

      {enabled && (
        <div className="mt-3" style={{ marginLeft: 26 }}>
          {/* Toolbar */}
          <div className="flex flex-wrap gap-3 mb-3">
            <label className="text-sm">
              <span className="block text-xs text-[var(--text-muted)] mb-1">
                {t(`${K}.route_style`, 'Route style')}
              </span>
              <select
                value={value.wayfinding_mode}
                onChange={(e) => set({ wayfinding_mode: e.target.value as Mode })}
                className="px-2 py-1 border border-[var(--border)] rounded text-sm"
              >
                {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs text-[var(--text-muted)] mb-1">
                {t(`${K}.ceiling_label`, 'Capability ceiling (what families are asked to consent to)')}
              </span>
              <select
                value={CEILING_OPTIONS.includes(value.wayfinding_capability_ceiling) ? value.wayfinding_capability_ceiling : 'C'}
                onChange={(e) => set({ wayfinding_capability_ceiling: e.target.value as Ceiling })}
                className="px-2 py-1 border border-[var(--border)] rounded text-sm"
              >
                {CEILING_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {CEILING_LABELS[c]}
                  </option>
                ))}
              </select>
              {!DE_ENABLED && (
                <span className="block text-xs text-[var(--text-muted)] mt-1">
                  {t(`${K}.de_held`, 'Live-map and path-recording (D/E) are pending review and not yet available.')}
                </span>
              )}
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="text-sm px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-alt)]"
            >
              {t(`${K}.import_gpx`, 'Import GPX…')}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".gpx,application/gpx+xml,application/xml,text/xml"
              onChange={onGpxFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={exportGpx}
              disabled={!activityId || exporting || wps.length === 0}
              className="text-sm px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-alt)] disabled:opacity-40"
              title={activityId ? '' : t(`${K}.save_first`, 'Save the activity first')}
            >
              {exporting ? t(`${K}.exporting`, 'Exporting…') : t(`${K}.export_gpx`, 'Export GPX')}
            </button>
            {value.route_geometry && (
              <button
                type="button"
                onClick={() => set({ route_geometry: null })}
                className="text-xs text-[var(--text-muted)] underline"
              >
                {t(`${K}.clear_path`, 'clear imported path')}
              </button>
            )}
            <span className="text-xs text-[var(--text-muted)]">
              {t(`${K}.map_hint`, 'Click the map to add a stop · drag pins to move')}
            </span>
          </div>
          {gpxError && <p className="text-red-500 text-xs mb-2">{gpxError}</p>}

          <div ref={mapRef} style={{ height: 320, borderRadius: 8, overflow: 'hidden' }} className="border border-[var(--border)] mb-3" />

          {/* Waypoint list */}
          {wps.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] italic">
              {t(`${K}.no_stops`, 'No stops yet — click the map or import a GPX file.')}
            </p>
          ) : (
            <ol className="space-y-2">
              {wps.map((w, i) => {
                const open = expanded === i
                const req = w.capture_requirements || {}
                return (
                  <li key={w.id || i} className="rounded border border-[var(--border)] p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-[var(--text-muted)] w-5 text-center">{i + 1}</span>
                      <input
                        value={w.name}
                        onChange={(e) => patchWp(i, { name: e.target.value })}
                        className="flex-1 px-2 py-1 border border-[var(--border)] rounded text-sm"
                        placeholder={`Stop ${i + 1} name`}
                      />
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                        className="px-1.5 text-[var(--text-muted)] disabled:opacity-30" aria-label={t(`${K}.move_up`, 'Move up')}>▲</button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === wps.length - 1}
                        className="px-1.5 text-[var(--text-muted)] disabled:opacity-30" aria-label={t(`${K}.move_down`, 'Move down')}>▼</button>
                      <button type="button" onClick={() => setExpanded(open ? null : i)}
                        className="px-1.5 text-[var(--primary)] text-sm">{open ? t(`${K}.less`, 'Less') : t(`${K}.edit`, 'Edit')}</button>
                      <button type="button" onClick={() => remove(i)}
                        className="px-1.5 text-red-500" aria-label={t(`${K}.remove_stop`, 'Remove stop')}>✕</button>
                    </div>

                    {open && (
                      <div className="mt-2 pl-7 grid gap-2">
                        <label className="text-xs text-[var(--text-muted)]">
                          {t(`${K}.clue`, 'Clue')}
                          <textarea
                            value={w.clue_text || ''}
                            onChange={(e) => patchWp(i, { clue_text: e.target.value })}
                            rows={2}
                            className="mt-1 w-full px-2 py-1 border border-[var(--border)] rounded text-sm text-[var(--text)]"
                            placeholder={t(`${K}.clue_placeholder`, 'What helps a student find this stop?')}
                          />
                        </label>
                        <div className="flex flex-wrap gap-4 items-center text-sm">
                          <label className="text-xs text-[var(--text-muted)]">
                            {t(`${K}.radius`, 'Arrival radius (m)')}
                            <input
                              type="number" min={5} max={500}
                              value={w.arrival_radius_meters}
                              onChange={(e) => patchWp(i, { arrival_radius_meters: Math.max(5, Math.min(500, parseInt(e.target.value) || 25)) })}
                              className="ml-2 w-20 px-2 py-1 border border-[var(--border)] rounded text-sm text-[var(--text)]"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-sm">
                            <input type="checkbox" checked={w.required}
                              onChange={(e) => patchWp(i, { required: e.target.checked })} />
                            {t(`${K}.required`, 'Required')}
                          </label>
                          <label className="flex items-center gap-1.5 text-sm">
                            <input type="checkbox" checked={!!req.photo} onChange={() => toggleCapture(i, 'photo')} />
                            {t(`${K}.ask_photo`, 'Ask for a photo')}
                          </label>
                          <label className="flex items-center gap-1.5 text-sm">
                            <input type="checkbox" checked={!!req.note} onChange={() => toggleCapture(i, 'note')} />
                            {t(`${K}.ask_note`, 'Ask for a note')}
                          </label>
                        </div>
                        <div className="flex gap-4 items-center text-xs text-[var(--text-muted)]">
                          <label>
                            {t(`${K}.clue_shows`, 'Clue shows')}
                            <select
                              value={w.hint_unlock_rule || 'immediate'}
                              onChange={(e) => patchWp(i, { hint_unlock_rule: e.target.value as WaypointInput['hint_unlock_rule'] })}
                              className="ml-2 px-2 py-1 border border-[var(--border)] rounded text-sm text-[var(--text)]"
                            >
                              <option value="immediate">{t(`${K}.unlock_immediate`, 'immediately')}</option>
                              <option value="after_minutes">{t(`${K}.unlock_after`, 'after N minutes')}</option>
                              <option value="on_arrival">{t(`${K}.unlock_on_arrival`, 'only after arriving')}</option>
                            </select>
                          </label>
                          {w.hint_unlock_rule === 'after_minutes' && (
                            <input
                              type="number" min={1} max={240}
                              value={w.hint_unlock_minutes || 5}
                              onChange={(e) => patchWp(i, { hint_unlock_minutes: Math.max(1, parseInt(e.target.value) || 5) })}
                              className="w-16 px-2 py-1 border border-[var(--border)] rounded text-sm text-[var(--text)]"
                            />
                          )}
                          <span className="font-mono">
                            {w.latitude.toFixed(5)}, {w.longitude.toFixed(5)}
                          </span>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
