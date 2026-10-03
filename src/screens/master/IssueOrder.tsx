// «Выдать наряд» (ТЗ §3): создание наряда, номер/дата — автоматически.

import { useState } from 'react'
import * as db from '../../lib/db'
import { ORDER_STATUS_LABELS, type WorkOrder } from '../../lib/types'
import { Btn, Screen } from '../../components/ui'
import OrderForm, { emptyValues, type OrderFormValues } from './OrderForm'
import type { MasterData } from './nav'

export default function IssueOrder({ data }: { data: MasterData }) {
  const [values, setValues] = useState<OrderFormValues>(emptyValues())
  const [bigFont, setBigFont] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<WorkOrder | null>(null)

  function validate(v: OrderFormValues): string | null {
    if (!v.description.trim()) return 'Заполните описание проблемы.'
    if (!v.areaId) return 'Выберите участок.'
    if (!v.equipmentId) return 'Выберите оборудование.'
    if (!v.workerId) return 'Выберите исполнителя.'
    if (!v.deadline) return 'Укажите срок исполнения.'
    return null
  }

  async function submit() {
    const problem = validate(values)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const order = await db.createOrder(
        {
          workType: values.workType,
          description: values.description.trim(),
          areaId: values.areaId,
          equipmentId: values.equipmentId,
          workerId: values.workerId,
          deadline: new Date(values.deadline).toISOString(),
          priority: values.priority,
          faultCode: values.faultCode.trim() || null,
          normHours: values.normHours ? Number(values.normHours) : null,
          photos: values.photos,
          comment: values.comment.trim() || null,
        },
        data.profile.fullName || 'Мастер',
      )
      setCreated(order)
      setValues(emptyValues())
      await data.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать наряд')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      title="Выдать наряд"
      subtitle="Поля со звёздочкой обязательны. Номер, дата и время выдачи генерируются автоматически."
      actions={
        <Btn variant="ghost" onClick={() => setBigFont(!bigFont)}>
          {bigFont ? 'Обычный вид' : 'Крупный шрифт по очереди'}
        </Btn>
      }
    >
      {created && (
        <div className="border border-green-600 bg-green-50 p-4 text-sm">
          Наряд <b>{created.number}</b> выдан ({ORDER_STATUS_LABELS[created.status]}).
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => data.go({ screen: 'order', id: created.id })}
          >
            Открыть карточку
          </button>
        </div>
      )}
      {error && <p role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <OrderForm data={data} values={values} onChange={setValues} bigFont={bigFont} />

      {!bigFont && (
        <div className="flex gap-3">
          <Btn onClick={submit} disabled={busy} className="text-base">
            {busy ? 'Выдаём…' : 'Выдать наряд'}
          </Btn>
        </div>
      )}
    </Screen>
  )
}
