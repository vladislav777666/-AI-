-- 0010_equipment_attributes.sql — поля оборудования из PDF §8:
-- «Оборудование: id, название, инвентарный номер, участок, тип, критичность».
-- Идемпотентна (IF NOT EXISTS), повторный запуск безопасен.

alter table public.equipment
  add column if not exists inventory_no text,
  add column if not exists equipment_type text,
  add column if not exists criticality text;

comment on column public.equipment.inventory_no is 'Инвентарный номер (PDF §8)';
comment on column public.equipment.equipment_type is 'Тип оборудования (PDF §8)';
comment on column public.equipment.criticality is 'Критичность оборудования (PDF §8), текстом';
