-- Observation Provenance v1
-- Additive metadata only. Does not change production authority, cadastral
-- interpretation, point coordinates, or existing point rows.
-- All new columns are nullable so current phone-GPS and keyed-coordinate
-- flows continue to work without fabricating unavailable device metadata.

alter table public.land_points
  drop constraint if exists land_points_source_check;

alter table public.land_points
  add constraint land_points_source_check
  check (
    source is null or source in (
      'phone-gps',
      'keyed-coordinate',
      'rtk-gnss',
      'total-station',
      'image-measurement',
      'drone',
      'lidar',
      'kml-import',
      'dxf-import',
      'csv-import',
      'unknown'
    )
  );

alter table public.land_points
  add column if not exists source_crs text,
  add column if not exists source_datum text,
  add column if not exists instrument_make text,
  add column if not exists instrument_model text,
  add column if not exists instrument_serial text,
  add column if not exists firmware_version text,
  add column if not exists correction_source text,
  add column if not exists correction_age_seconds double precision
    check (correction_age_seconds is null or correction_age_seconds >= 0),
  add column if not exists pdop double precision
    check (pdop is null or pdop >= 0),
  add column if not exists satellite_count integer
    check (satellite_count is null or satellite_count >= 0),
  add column if not exists tilt_status text
    check (
      tilt_status is null or tilt_status in (
        'unknown',
        'not-applicable',
        'disabled',
        'enabled'
      )
    ),
  add column if not exists signal_integrity_status text
    check (
      signal_integrity_status is null or signal_integrity_status in (
        'unknown',
        'normal',
        'interference-suspected',
        'jamming-suspected',
        'spoofing-suspected'
      )
    );

comment on column public.land_points.source_crs is
  'Declared/source CRS associated with the observation or imported coordinate. Never inferred silently.';
comment on column public.land_points.source_datum is
  'Declared/source datum associated with the observation. Never inferred silently.';
comment on column public.land_points.signal_integrity_status is
  'Optional receiver/device integrity diagnostic. Null means unavailable; do not fabricate.';
