# Family sharing: car roles (E2)

Status: built 2026-11-23 (wave3-service), migration `0070_family_car_roles.sql` NOT applied.

## Context
Vehicles already have several members (join code, `vehicle_members`). Every member reads the car's status, orders, notices
(`car_status`, `car_orders`, `notifications` RLS: `current_user_vehicle_id()`), and until now every member could also send
orders (Control remoto, "Enviar al auto") and link/unlink the car. vigo-hack `wikivigo/PLAN.md` E2: members see the car, and the
owner decides who may act on it.

## Requirements
- R1. `vehicle_members.car_role` `view | control`; new joiners get `view`. The creator (`vehicles.created_by`) always has control.
- R2. `set_vehicle_member_role(p_user, p_role)`: creator only, not on themself.
- R3. `my_car_role()` → `owner | control | view` for the UI; `can_control_car(vehicle)` for the checks.
- R4. Enforcement by triggers on `car_orders` (insert/update: create, cancel, supersede) and `car_devices` (insert = link,
  update of `revoked_at` = unlink) for signed-in callers only (`auth.uid()` not null). The car's own service-role writes pass.
  Triggers, not edits inside `create_car_order`, so a later `create or replace` of those functions keeps the check.
- R5. RLS review fix: `prevent_join_code_update` also pins `created_by`, `id`, `created_at` for client sessions. Before, the row-level
  update policy let any member make themself the creator.
- R6. Web: VehicleCard shows a role select per member to the creator ("Solo ver el auto" / "Ver y controlar el auto"), a member sees
  their own role; CarRemoteCard hides buttons and "Cancelar" for `view` with a notice. Before 0070 the role is unknown and the web
  behaves as today (member list falls back to `user_id` only).

## Owner decisions (open)
- O-F1. Backfill: existing members get `control` (nothing changes on apply). Switch the `update` in 0070 to keep `view` if preferred.
- O-F2. Should `view` members also stop getting car notices (charge done etc.)? Built: they get them (E2 "see notices").

## Test plan
- `src/lib/carRole.test.ts`: role parsing, `canControl` (unknown = today's behaviour), RPC names and error pass-through.
- `src/components/CarRemoteCard.test.tsx`: view-only member has no buttons/cancel and sees the notice; control keeps them.
- After apply (manual, two accounts on one vehicle): joiner is `view`; `create_car_order` from it raises "Tu permiso en este
  vehículo es solo ver"; creator sets `control`; order works; `update vehicles set created_by = <me>` from a member is a no-op.
