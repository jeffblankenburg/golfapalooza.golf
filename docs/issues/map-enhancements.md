## Overview

Overhaul the live scoring map view and admin map editor with better markers, distance measurement, and an ideal drive landing zone.

## Changes

### Map Markers
- Replace the tee SVG icon (green circle+stick) with a simple **blue dot**
- Replace the green/flag SVG icon with a simple **green dot**
- Both should be clean, small, and unobtrusive

### Ideal Drive / Distance Measurement Circle
- New **open/hollow circle** marker representing the ideal landing spot
- On non-par-3 holes: positioned at the admin-set drive point (default ~250 yards from tee)
- On par 3 holes: positioned on the green
- **Always draggable** — user can move it anywhere on the map to measure distance to course features (bunkers, water, doglegs)
- Shows distance labels:
  - Dashed line from tee to circle with yardage
  - Dashed line from circle to green with yardage
- When user GPS is detected near the hole, show distance from user's position to the green center

### Admin Map Editor (`HoleMapEditor.tsx`)
- Add a third "Place Drive" button alongside Tee and Green
- Drive marker appears as a hollow circle (matching live view)
- Show all three distances: Tee→Drive, Drive→Green, Tee→Green
- Drive point is saved to `course_holes` as `drive_latitude` / `drive_longitude`

### Database
Add to `course_holes`:
```sql
ALTER TABLE public.course_holes
  ADD COLUMN IF NOT EXISTS drive_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS drive_longitude DOUBLE PRECISION;
```

## Acceptance Criteria

- [ ] Tee marker is a blue dot, green marker is a green dot
- [ ] Admin can place a drive landing point per hole via the map editor
- [ ] Live scoring map shows the drive point as a draggable hollow circle
- [ ] Dashed lines connect tee→circle→green with distance labels
- [ ] Dragging the circle updates distances in real time
- [ ] Par 3 holes show the circle on the green (still draggable for distance measurement)
- [ ] User GPS location shows distance to green when in vicinity
