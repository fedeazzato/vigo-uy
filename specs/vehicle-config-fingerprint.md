# Vehicle config fingerprint (C4)

Status: built 2026-11-23 (wave3-service), migration `0071_vehicle_config_snapshots.sql` NOT applied.

## Context
The head unit holds the car's factory configuration bytes (`sys.df.vehicle_config_head` / `_tail`; decoded items 119/134/161 = market
and options; GPS source flag). A dealer visit can change them. vigo-hack `wikivigo/PLAN.md` C4: store them privately to compare
before/after; never public.

## Requirements
- R1. The installer (vigo-hack `installer/car/install_all.sh fingerprint`) writes `configuracion_del_auto.txt`:
  `vigo-vehicle-config 1` then `label=`, `taken=`, `firmware=`, `head=`, `tail=`, `item119=`, `item134=`, `item161=`, `gps_source=`.
  It saves one at Instalar, Antes del service and Después del service (Documents\VigoInstaller\<time>\), and compares on the car.
- R2. `vehicle_config_snapshots`: one account only (RLS `user_id = auth.uid()`; not vehicle members, not moderators, no anon, no
  aggregate). Strict checks on the byte strings and a 50-row limit per account.
- R3. Page Mi Vigo › Configuración del auto (`/mi-vigo/configuracion`): upload the file, list copies, delete, compare two (decoded
  items, firmware, then every changed byte).

## Owner decisions (open)
- O-C1. Upload is manual (file from the installer). Automatic upload by Mi Vigo would need a Mi Vigo change + a car-device
  Edge Function action; not built.

## Test plan
- `src/lib/vehicleConfig.test.ts`: parse, refuse other files / bad bytes / junk values, diff names the market change and bytes.
- vigo-hack `installer/test/service_tests.sh`: fingerprint file format, compare on the car.
