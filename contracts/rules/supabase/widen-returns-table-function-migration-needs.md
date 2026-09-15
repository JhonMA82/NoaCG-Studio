---
v: 1
scope: supabase/migrations/**
kind: trap
fires: contract
status: active
since: 2026-09-15
record: contracts/records/supabase/2026-09-15-widen-returns-table-function-migration-needs.md
---
Widen a RETURNS TABLE function in the migration that needs it. db:push already exempts a DROP of an object the same file creates back, so the drop-and-create applies unattended and needs no --allow. Deferring such a widening to spare an owner action buys nothing and costs a second migration.
