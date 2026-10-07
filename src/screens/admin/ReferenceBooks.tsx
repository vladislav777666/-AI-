// Раздел «Справочники» (ТЗ §2) — веб-панель администратора.
// Пять модулей: Участки (§2.1), Материалы (§2.2), Оборудование (§2.3),
// Сотрудники (§2.4), Шифры неисправности (§2.5), + списки нарядов (§2.3/§2.4)
// и детальный просмотр шифра (§2.5).
// Все изменения пишутся в БД через db.* (persist → офлайн-очередь).

import { useEffect, useState } from 'react'
import * as db from '../../lib/db'
import {
  WORK_TYPE_LABELS, type Equipment, type FaultCode, type Material, type WorkOrder, type WorkType,
} from '../../lib/types'
import { Btn, Card, Screen, Select, TextArea, TextInput } from '../../components/ui'
import OrdersTable from './OrdersTable'
import type { AdminData, RefBookKey } from './nav'

// ---------- Раздел (базовый узел навигации) ----------

const BOOKS: Array<{ key: RefBookKey; label: string; hint: string }> = [
  { key: 'areas', label: 'Участки', hint: 'Подразделения: оборудование, сотрудники, материалы' },
  { key: 'materials', label: 'Материалы и запчасти', hint: 'Номенклатура запчастей, кол-во, участок' },
  { key: 'equipment', label: 'Оборудование', hint: 'Единицы техники и списки нарядов по ним' },
  { key: 'workers', label: 'Сотрудники', hint: 'Персонал, разряд, бригада и списки нарядов' },
  { key: 'faultCodes', label: 'Шифры неисправности', hint: 'Типовые поломки, нормативы, план/внеплан' },
]

export function RefBooksHub({ data }: { data: AdminData }) {
  return (
    <Screen title="Справочники" subtitle="Разделы администрирования предприятия">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BOOKS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => data.go({ screen: 'refbook', book: b.key })}
            className="border border-neutral-900 bg-white px-6 py-5 text-left transition-colors hover:bg-neutral-900 hover:text-white"
          >
            <div className="text-lg font-medium">{b.label}</div>
            <div className="mt-1 text-sm opacity-70">{b.hint}</div>
          </button>
        ))}
      </div>
    </Screen>
  )
}

export default function ReferenceBooks({ data, book }: { data: AdminData; book: RefBookKey }) {
  switch (book) {
    case 'areas':
      return <AreasModule data={data} />
    case 'materials':
      return <MaterialsModule data={data} />
    case 'equipment':
      return <EquipmentModule data={data} />
    case 'workers':
      return <WorkersModule data={data} />
    case 'faultCodes':
      return <FaultCodesModule data={data} />
  }
}

// ---------- Вспомогательные загрузчики ----------

function useFaultCodes(): FaultCode[] | null {
  const [rows, setRows] = useState<FaultCode[] | null>(null)
  useEffect(() => {
    let alive = true
    void db.listFaultCodes().then((r) => alive && setRows(r)).catch(() => alive && setRows([]))
    return () => { alive = false }
  }, [])
  return rows
}

function useMaterials(): Material[] | null {
  const [rows, setRows] = useState<Material[] | null>(null)
  useEffect(() => {
    let alive = true
    void db.listMaterials().then((r) => alive && setRows(r)).catch(() => alive && setRows([]))
    return () => { alive = false }
  }, [])
  return rows
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Не удалось сохранить'
}

// ---------- Список чекбоксов (замена <select multiple>) ----------
// Мультивыбор через <select multiple> требовал удерживать Ctrl и на
// мобильных не работал вовсе — из-за этого изменения «не сохранялись».
// Чекбоксы решают это: клик по строке отмечает/снимает элемент.

function CheckList({ options, selected, onToggle, emptyText }: {
  options: Array<{ id: string; label: string }>
  selected: string[]
  onToggle: (id: string) => void
  emptyText: string
}) {
  return (
    <div className="max-h-44 overflow-y-auto border border-neutral-300 bg-white p-2">
      {options.length === 0 && <p className="px-1 py-1 text-sm text-neutral-400">{emptyText}</p>}
      {options.map((o) => (
        <label key={o.id} className="flex cursor-pointer items-center gap-2 px-1 py-1 text-sm text-neutral-900">
          <input
            type="checkbox"
            checked={selected.includes(o.id)}
            onChange={() => onToggle(o.id)}
            className="h-4 w-4 accent-neutral-900"
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  )
}

// ---------- §2.1 Участки ----------

function AreasModule({ data }: { data: AdminData }) {
  const materials = useMaterials()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [eqIds, setEqIds] = useState<string[]>([])
  const [wIds, setWIds] = useState<string[]>([])
  const [mIds, setMIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const areaName = (id: string | null) =>
    (id && data.areas.find((a) => a.id === id)?.name) || 'Без участка'

  function startAdd() {
    setEditingId(null); setName(''); setEqIds([]); setWIds([]); setMIds([]); setError(null); setOpen(true)
  }

  function startEdit(id: string) {
    const area = data.areas.find((a) => a.id === id)
    if (!area) return
    setEditingId(id)
    setName(area.name)
    setEqIds(data.equipment.filter((e) => e.areaId === id).map((e) => e.id))
    setWIds(data.workers.filter((w) => w.areaId === id).map((w) => w.id))
    setMIds((materials ?? []).filter((m) => m.areaId === id).map((m) => m.id))
    setError(null)
    setOpen(true)
  }

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Укажите название участка'); return }
    setBusy(true); setError(null)
    try {
      let id = editingId
      if (id) await db.updateArea(id, trimmed)
      else id = (await db.createArea(trimmed)).id
      const eqSel = new Set(eqIds); const wSel = new Set(wIds); const mSel = new Set(mIds)
      await Promise.all([
        // Оборудование: галочка закрепляет за этим участком (переносит из
        // прежнего), снятая галочка — открепляет совсем (0009, area_id → null).
        ...data.equipment
          .filter((e) => eqSel.has(e.id))
          .map((e) => db.updateEquipment(e.id, id)),
        ...data.equipment
          .filter((e) => !eqSel.has(e.id) && e.areaId === id)
          .map((e) => db.updateEquipment(e.id, null)),
        ...data.workers
          .filter((w) => wSel.has(w.id) || w.areaId === id)
          .map((w) => db.updateWorker(w.id, { areaId: wSel.has(w.id) ? id : null })),
        ...(materials ?? [])
          .filter((m) => mSel.has(m.id) || m.areaId === id)
          .map((m) => db.saveMaterial({ ...m, areaId: mSel.has(m.id) ? id : null })),
      ])
      await data.refresh()
      setOpen(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      title="Участки"
      subtitle="Территориальные и структурные подразделения (ТЗ §2.1)"
      actions={<Btn onClick={startAdd}>Добавить участок</Btn>}
    >
      {error && <p role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {open && (
        <Card className="border-neutral-900">
          <h3 className="font-semibold">{editingId ? 'Изменение участка' : 'Новый участок'}</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm text-neutral-500 sm:col-span-3">
              Название участка
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Участок №3" />
            </label>
            <div className="flex flex-col gap-1 text-sm text-neutral-500">
              <span>Закреплённое оборудование</span>
              <CheckList
                options={data.equipment.map((e) => ({
                  id: e.id,
                  // Показываем чужой участок и «без участка», чтобы галочка
                  // не выглядела как переключатель внутри одного участка.
                  label:
                    e.areaId === editingId ? e.name
                    : e.areaId ? `${e.name} · ${areaName(e.areaId)}`
                    : `${e.name} · без участка`,
                }))}
                selected={eqIds}
                onToggle={(id) => toggle(eqIds, setEqIds, id)}
                emptyText="Оборудования пока нет"
              />
            </div>
            <div className="flex flex-col gap-1 text-sm text-neutral-500">
              <span>Привязанные сотрудники</span>
              <CheckList
                options={data.workers.map((w) => ({ id: w.id, label: w.fullName }))}
                selected={wIds}
                onToggle={(id) => toggle(wIds, setWIds, id)}
                emptyText="Сотрудников пока нет"
              />
            </div>
            <div className="flex flex-col gap-1 text-sm text-neutral-500 sm:col-span-1">
              <span>Доступные материалы</span>
              <CheckList
                options={(materials ?? []).map((m) => ({ id: m.id, label: m.name }))}
                selected={mIds}
                onToggle={(id) => toggle(mIds, setMIds, id)}
                emptyText="Материалов пока нет"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Подсказка: отметьте нужные элементы галочками — можно выбрать сразу несколько
            (галочка снимается повторным кликом). Снятая галочка открепляет элемент от участка:
            оборудование останется в справочнике §2.3 как «без участка», сотрудник и материал — без привязки.
          </p>
          <div className="mt-3 flex gap-3">
            <Btn onClick={save} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Btn>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Отмена</Btn>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {data.areas.length === 0 && <p className="text-sm text-neutral-500">Участков пока нет.</p>}
        {data.areas.map((a) => {
          const eq = data.equipment.filter((e) => e.areaId === a.id).length
          const w = data.workers.filter((x) => x.areaId === a.id).length
          const m = (materials ?? []).filter((x) => x.areaId === a.id).length
          return (
            <Card key={a.id}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{a.name}</span>
                <span className="text-xs text-neutral-500">
                  Оборудование: {eq} · Сотрудники: {w} · Материалы: {m}
                </span>
                <Btn variant="ghost" className="ml-auto" onClick={() => startEdit(a.id)}>Изменить</Btn>
              </div>
            </Card>
          )
        })}
      </div>
    </Screen>
  )
}

// ---------- §2.2 Материалы и запчасти ----------

function MaterialsModule({ data }: { data: AdminData }) {
  const materials = useMaterials()
  const [rows, setRows] = useState<Material[] | null>(null)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('шт')
  const [areaId, setAreaId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startAdd() {
    setEditingId(null); setName(''); setQty('1'); setUnit('шт'); setAreaId(''); setError(null); setOpen(true)
  }

  function startEdit(m: Material) {
    setEditingId(m.id); setName(m.name); setQty(String(m.qty)); setUnit(m.unit)
    setAreaId(m.areaId ?? ''); setError(null); setOpen(true)
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Укажите название материала'); return }
    setBusy(true); setError(null)
    try {
      await db.saveMaterial({
        id: editingId ?? undefined,
        name: trimmed,
        qty: Number(qty) || 0,
        unit: unit.trim() || 'шт',
        areaId: areaId || null,
      })
      setRows(await db.listMaterials())
      setOpen(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(m: Material) {
    if (!window.confirm(`Удалить материал «${m.name}»?`)) return
    setBusy(true)
    try {
      await db.deleteMaterial(m.id)
      setRows(await db.listMaterials())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const list = rows ?? materials ?? []
  const areaName = (id: string | null) => (id && data.areas.find((a) => a.id === id)?.name) || '—'

  return (
    <Screen
      title="Материалы и запчасти"
      subtitle="Общий список номенклатуры (ТЗ §2.2)"
      actions={<Btn onClick={startAdd}>Добавить материал</Btn>}
    >
      {error && <p role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {open && (
        <Card className="border-neutral-900">
          <h3 className="font-semibold">{editingId ? 'Изменение материала' : 'Новый материал'}</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm text-neutral-500 sm:col-span-2">
              Название материала
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Подшипник 6205" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Кол-во
              <TextInput type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Единица
              <TextInput value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="шт" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500 sm:col-span-4">
              Привязка к участку
              <Select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                <option value="">Без участка</option>
                {data.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </label>
          </div>
          <div className="mt-3 flex gap-3">
            <Btn onClick={save} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Btn>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Отмена</Btn>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {list.length === 0 && <p className="text-sm text-neutral-500">Материалов пока нет.</p>}
        {list.map((m) => (
          <Card key={m.id}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{m.name}</span>
              <span className="text-sm tabular-nums text-neutral-600">{m.qty} {m.unit}</span>
              <span className="text-xs text-neutral-500">Участок: {areaName(m.areaId)}</span>
              <span className="ml-auto flex gap-2">
                <Btn variant="ghost" onClick={() => startEdit(m)}>Изменить</Btn>
                <Btn variant="danger" onClick={() => void remove(m)} disabled={busy}>Удалить</Btn>
              </span>
            </div>
          </Card>
        ))}
      </div>
    </Screen>
  )
}

// ---------- §2.3 Оборудование ----------

function EquipmentModule({ data }: { data: AdminData }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [areaId, setAreaId] = useState('')
  // Атрибуты PDF §8: инвентарный номер, тип, критичность.
  const [inv, setInv] = useState('')
  const [eqType, setEqType] = useState('')
  const [crit, setCrit] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Укажите название оборудования'); return }
    if (!areaId) { setError('Выберите участок'); return }
    setBusy(true); setError(null)
    try {
      await db.createEquipment(trimmed, areaId, {
        inventoryNo: inv.trim() || null,
        equipmentType: eqType.trim() || null,
        criticality: crit.trim() || null,
      })
      await data.refresh()
      setName(''); setInv(''); setEqType(''); setCrit(''); setOpen(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const ordersByEq = (id: string) => data.orders.filter((o) => o.equipmentId === id).length

  /** Закрепление оборудования за участком; пустое значение — открепить (ТЗ §2.1). */
  async function reassign(e: Equipment, nextAreaId: string) {
    setBusy(true); setError(null)
    try {
      await db.updateEquipment(e.id, nextAreaId || null)
      await data.refresh()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      title="Оборудование"
      subtitle="Список оборудования (ТЗ §2.3)"
      actions={<Btn onClick={() => { setError(null); setOpen(!open) }}>Добавить оборудование</Btn>}
    >
      {error && <p role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {open && (
        <Card className="border-neutral-900">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Название
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Насос НБ-4" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Участок
              <Select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                <option value="">Выберите участок</option>
                {data.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Инвентарный номер
              <TextInput value={inv} onChange={(e) => setInv(e.target.value)} placeholder="INV-0101" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Тип оборудования
              <TextInput value={eqType} onChange={(e) => setEqType(e.target.value)} placeholder="Насосы" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Критичность
              <TextInput value={crit} onChange={(e) => setCrit(e.target.value)} placeholder="Высокая / Средняя / Низкая" />
            </label>
          </div>
          <div className="mt-3 flex gap-3">
            <Btn onClick={save} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Btn>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Отмена</Btn>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {data.equipment.length === 0 && <p className="text-sm text-neutral-500">Оборудования пока нет.</p>}
        {data.equipment.map((e) => (
          <Card key={e.id} onClick={() => data.go({ screen: 'equipmentOrders', equipmentId: e.id })}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{e.name}</span>
              {(e.inventoryNo || e.equipmentType || e.criticality) && (
                <span className="text-xs text-neutral-500">
                  {[e.inventoryNo, e.equipmentType, e.criticality].filter(Boolean).join(' · ')}
                </span>
              )}
              {/* Участок меняется прямо в списке: карточка ведёт к нарядам,
                  поэтому клики по селекту не должны её открывать. */}
              <span
                className="flex items-center gap-2 text-sm text-neutral-500"
                onClick={(ev) => ev.stopPropagation()}
              >
                Участок
                <Select
                  value={e.areaId ?? ''}
                  onChange={(ev) => void reassign(e, ev.target.value)}
                  disabled={busy}
                  className="max-w-44 text-sm"
                >
                  <option value="">Без участка</option>
                  {data.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </span>
              <span className="ml-auto text-xs text-neutral-500">
                Нарядов: {ordersByEq(e.id)} →
              </span>
            </div>
          </Card>
        ))}
      </div>
    </Screen>
  )
}

/** «Список нарядов по оборудованию» (ТЗ §2.3). */
export function EquipmentOrders({ data, equipmentId }: { data: AdminData; equipmentId: string }) {
  const equipment = data.equipment.find((e) => e.id === equipmentId)
  const orders = data.orders.filter((o) => o.equipmentId === equipmentId)
  return (
    <Screen
      title={`Наряды: ${equipment?.name ?? '—'}`}
      subtitle={`Список нарядов по оборудованию (ТЗ §2.3) · всего: ${orders.length}`}
    >
      <OrdersTable data={data} orders={orders} />
    </Screen>
  )
}

// ---------- §2.4 Сотрудники ----------

function WorkersModule({ data }: { data: AdminData }) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [rank, setRank] = useState('')
  const [brigade, setBrigade] = useState('')
  const [areaId, setAreaId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setEditingId(null); setFullName(''); setSpecialty(''); setRank('')
    setBrigade(''); setAreaId(''); setError(null)
  }

  async function save() {
    if (!fullName.trim()) { setError('Укажите имя сотрудника'); return }
    setBusy(true); setError(null)
    try {
      const input = {
        fullName: fullName.trim(),
        specialty: specialty.trim() || 'Слесарь',
        rank: rank.trim() || null,
        brigade: brigade.trim() || null,
        areaId: areaId || null,
      }
      if (editingId) await db.updateWorker(editingId, input)
      else await db.createWorker(input)
      await data.refresh()
      setOpen(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  function startEdit(w: { id: string; fullName: string; specialty: string; rank: string | null; brigade: string | null; areaId: string | null }) {
    setEditingId(w.id); setFullName(w.fullName); setSpecialty(w.specialty)
    setRank(w.rank ?? ''); setBrigade(w.brigade ?? ''); setAreaId(w.areaId ?? '')
    setError(null); setOpen(true)
  }

  const areaName = (id: string | null) => (id && data.areas.find((a) => a.id === id)?.name) || '—'

  return (
    <Screen
      title="Сотрудники"
      subtitle="Персонал в нарядах (ТЗ §2.4)"
      actions={
        <Btn onClick={() => { if (open) { setOpen(false) } else { reset(); setOpen(true) } }}>
          Добавить Сотрудника
        </Btn>
      }
    >
      {error && <p role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {open && (
        <Card className="border-neutral-900">
          <h3 className="font-semibold">{editingId ? 'Карточка сотрудника' : 'Новый сотрудник'}</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Имя
              <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Иванов И.И." />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Специальность
              <TextInput value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Слесарь" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Разряд
              <TextInput value={rank} onChange={(e) => setRank(e.target.value)} placeholder="5 разряд" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Бригада
              <TextInput value={brigade} onChange={(e) => setBrigade(e.target.value)} placeholder="Бригада №1" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500 sm:col-span-2">
              Участок
              <Select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                <option value="">Без участка</option>
                {data.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </label>
          </div>
          <div className="mt-3 flex gap-3">
            <Btn onClick={save} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Btn>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Отмена</Btn>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {data.workers.length === 0 && <p className="text-sm text-neutral-500">Сотрудников пока нет.</p>}
        {data.workers.map((w) => (
          <Card key={w.id} onClick={() => data.go({ screen: 'workerOrders', workerId: w.id })}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{w.fullName}</span>
              <span className="text-sm text-neutral-500">
                {[w.specialty, w.rank].filter(Boolean).join(', ')}
              </span>
              <span className="text-sm text-neutral-500">{w.brigade ?? 'без бригады'}</span>
              <span className="text-xs text-neutral-500">Участок: {areaName(w.areaId)}</span>
              <span className="ml-auto flex gap-2">
                <span className="text-xs text-neutral-500">
                  Нарядов: {data.orders.filter((o) => o.workerId === w.id).length} →
                </span>
                <Btn
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); startEdit(w) }}
                >
                  Изменить
                </Btn>
              </span>
            </div>
          </Card>
        ))}
      </div>
    </Screen>
  )
}

// ---------- Наряды сотрудника: смена + все работы (ТЗ §2.4) ----------

/** Незавершённые работы исполнитель выполняет «сейчас» — они на текущей смене. */
const SHIFT_ACTIVE: WorkOrder['status'][] = ['accepted', 'in_work', 'suspended', 'rework']

function isSameDay(iso: string, now: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

/** Работа на этой смене: тронута сегодня (выдача/старт/сдача/закрытие) или ещё выполняется. */
function isOnShift(o: WorkOrder, now: Date): boolean {
  if (SHIFT_ACTIVE.includes(o.status)) return true
  return [o.createdAt, o.startedAt, o.completedAt, o.closedAt].some((t) => !!t && isSameDay(t, now))
}

/** «Список нарядов Сотрудника» (ТЗ §2.4): работы на этой смене + все работы. */
export function WorkerOrders({ data, workerId }: { data: AdminData; workerId: string }) {
  const worker = data.workers.find((w) => w.id === workerId)
  const orders = data.orders.filter((o) => o.workerId === workerId)
  const now = new Date()
  const shift = orders.filter((o) => isOnShift(o, now))

  return (
    <Screen
      title={`Наряды: ${worker?.fullName ?? '—'}`}
      subtitle={`Работы на этой смене и все работы сотрудника (ТЗ §2.4) · всего: ${orders.length}`}
    >
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Работы на этой смене <span className="text-sm font-normal text-neutral-500">({shift.length})</span></h3>
        <p className="text-xs text-neutral-500">
          Смена — с полуночи сегодняшнего дня; незавершённые работы тоже считаются текущей сменой.
        </p>
        {shift.length === 0
          ? <p className="text-sm text-neutral-500">В эту смену работ нет.</p>
          : <OrdersTable data={data} orders={shift} />}
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-neutral-200 pt-4">
        <h3 className="text-lg font-semibold">Все работы <span className="text-sm font-normal text-neutral-500">({orders.length})</span></h3>
        <OrdersTable data={data} orders={orders} />
      </div>
    </Screen>
  )
}

// ---------- §2.5 Шифры неисправности ----------

interface FaultCodeForm {
  code: string
  name: string
  description: string
  normHours: string
  materialNorm: string
  workType: WorkType
  /** Весовой коэффициент сложности 1..5 (панель руководителя, Р. 2 п.4). */
  complexity: string
  /** Материальный норматив в единицах списания (Р. 3.4). */
  materialNormQty: string
}

const EMPTY_FAULT_FORM: FaultCodeForm = {
  code: '', name: '', description: '', normHours: '', materialNorm: '', workType: 'unplanned',
  complexity: '3', materialNormQty: '',
}

function FaultCodesModule({ data }: { data: AdminData }) {
  const codes = useFaultCodes()
  const [local, setCodesLocal] = useState<FaultCode[] | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FaultCodeForm>(EMPTY_FAULT_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!form.code.trim()) { setError('Укажите шифр'); return }
    if (!form.name.trim()) { setError('Укажите название шифра'); return }
    setBusy(true); setError(null)
    try {
      await db.createFaultCode({
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim(),
        normHours: form.normHours ? Number(form.normHours) : null,
        materialNorm: form.materialNorm.trim() || null,
        workType: form.workType,
        complexity: form.complexity ? Number(form.complexity) : null,
        materialNormQty: form.materialNormQty ? Number(form.materialNormQty) : null,
      })
      const fresh = await db.listFaultCodes()
      setCodesLocal(fresh)
      setForm(EMPTY_FAULT_FORM)
      setOpen(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const rows = local ?? codes ?? []

  return (
    <Screen
      title="Шифры неисправности"
      subtitle="Справочник типовых поломок и регламентов (ТЗ §2.5)"
      actions={<Btn onClick={() => { setError(null); setOpen(!open) }}>Добавить ШИФР</Btn>}
    >
      {error && <p role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {open && (
        <Card className="border-neutral-900">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Шифр
              <TextInput value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="М-05" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Название
              <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Механика: износ втулки" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500 sm:col-span-2">
              Описание
              <TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Норматив времени, ч
              <TextInput type="number" min={0} step={0.5} value={form.normHours} onChange={(e) => setForm({ ...form, normHours: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Статус
              <Select value={form.workType} onChange={(e) => setForm({ ...form, workType: e.target.value as WorkType })}>
                <option value="planned">{WORK_TYPE_LABELS.planned}</option>
                <option value="unplanned">{WORK_TYPE_LABELS.unplanned}</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500 sm:col-span-2">
              Материальный норматив
              <TextInput value={form.materialNorm} onChange={(e) => setForm({ ...form, materialNorm: e.target.value })} placeholder="Подшипник, съёмник, смазка" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Сложность, 1–5
              <TextInput type="number" min={1} max={5} value={form.complexity} onChange={(e) => setForm({ ...form, complexity: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-500">
              Норматив ТМЦ (ед. списания)
              <TextInput type="number" min={0} step={0.5} value={form.materialNormQty} onChange={(e) => setForm({ ...form, materialNormQty: e.target.value })} />
            </label>
          </div>
          <div className="mt-3 flex gap-3">
            <Btn onClick={save} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Btn>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Отмена</Btn>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {rows.length === 0 && <p className="text-sm text-neutral-500">Шифров пока нет.</p>}
        {rows.map((f) => (
          <Card key={f.code} onClick={() => data.go({ screen: 'faultCode', code: f.code })}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono font-medium">{f.code}</span>
              <span className="text-sm">{f.name}</span>
              <span className="text-xs text-neutral-500">
                {f.workType ? WORK_TYPE_LABELS[f.workType] : '—'}
                {f.normHours != null ? ` · ${f.normHours} ч` : ''}
              </span>
              <span className="ml-auto text-xs text-neutral-400">Открыть →</span>
            </div>
          </Card>
        ))}
      </div>
    </Screen>
  )
}

/** Детальный просмотр и редактирование шифра (ТЗ §2.5). */
export function FaultCodeDetail({ data, code }: { data: AdminData; code: string }) {
  const codes = useFaultCodes()
  const current = codes?.find((f) => f.code === code) ?? null
  const [form, setForm] = useState<FaultCodeForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (current && !form) {
      setForm({
        code: current.code,
        name: current.name,
        description: current.description,
        normHours: current.normHours != null ? String(current.normHours) : '',
        materialNorm: current.materialNorm ?? '',
        workType: current.workType ?? 'unplanned',
        complexity: current.complexity != null ? String(current.complexity) : '3',
        materialNormQty: current.materialNormQty != null ? String(current.materialNormQty) : '',
      })
    }
  }, [current, form])

  async function save() {
    if (!form) return
    setBusy(true); setError(null); setSaved(false)
    try {
      await db.updateFaultCode(code, {
        name: form.name.trim(),
        description: form.description.trim(),
        normHours: form.normHours ? Number(form.normHours) : null,
        materialNorm: form.materialNorm.trim() || null,
        workType: form.workType,
        complexity: form.complexity ? Number(form.complexity) : null,
        materialNormQty: form.materialNormQty ? Number(form.materialNormQty) : null,
      })
      setSaved(true)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (!codes || !form) {
    return <Screen title={`Шифр ${code}`}><p className="text-sm text-neutral-500">Загрузка…</p></Screen>
  }

  return (
    <Screen title={`Шифр ${code}`} subtitle="Детальный просмотр и редактирование параметров (ТЗ §2.5)">
      {error && <p role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {saved && <p className="border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">Сохранено.</p>}

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-neutral-500">
            Шифр
            <TextInput value={form.code} disabled />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-500">
            Название
            <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-500 sm:col-span-2">
            Описание
            <TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-500">
            Норматив времени, ч
            <TextInput type="number" min={0} step={0.5} value={form.normHours} onChange={(e) => setForm({ ...form, normHours: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-500">
            Статус
            <Select value={form.workType} onChange={(e) => setForm({ ...form, workType: e.target.value as WorkType })}>
              <option value="planned">{WORK_TYPE_LABELS.planned}</option>
              <option value="unplanned">{WORK_TYPE_LABELS.unplanned}</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-500 sm:col-span-2">
            Материальный норматив
            <TextInput value={form.materialNorm} onChange={(e) => setForm({ ...form, materialNorm: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-500">
            Сложность (1 — мелкий ремонт, 5 — капитальный)
            <TextInput type="number" min={1} max={5} value={form.complexity} onChange={(e) => setForm({ ...form, complexity: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-500">
            Норматив ТМЦ, единиц списания
            <TextInput type="number" min={0} step={0.5} value={form.materialNormQty} onChange={(e) => setForm({ ...form, materialNormQty: e.target.value })} />
          </label>
        </div>
        <div className="mt-4 flex gap-3">
          <Btn onClick={save} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Btn>
          <Btn variant="ghost" onClick={data.back}>Назад к списку</Btn>
        </div>
      </Card>
    </Screen>
  )
}
