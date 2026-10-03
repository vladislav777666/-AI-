// Уведомления (ТЗ §2.2): последние события по всем нарядам.

import { useEffect, useState } from 'react'
import * as db from '../../lib/db'
import { Screen } from '../../components/ui'
import type { MasterData } from './nav'

type Entry = Awaited<ReturnType<typeof db.recentHistory>>[number]

export default function Notifications({ data }: { data: MasterData }) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void db
      .recentHistory(50)
      .then((e) => alive && setEntries(e))
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Ошибка загрузки'))
    return () => { alive = false }
  }, [data.orders.length])

  return (
    <Screen title="Уведомления" subtitle="Последние события по нарядам">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!entries && !error && <p className="text-sm text-neutral-500">Загрузка…</p>}
      {entries && entries.length === 0 && <p className="text-sm text-neutral-500">Событий пока нет.</p>}
      <div className="flex flex-col gap-2">
        {entries?.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => data.go({ screen: 'order', id: e.orderId })}
            className="border border-neutral-200 p-3 text-left text-sm transition-colors hover:border-neutral-900"
          >
            <span className="font-medium">{e.orderNumber}</span> · {e.action}
            <span className="ml-2 text-neutral-500">— {e.actorName}</span>
            <span className="ml-2 text-xs text-neutral-400">
              {new Date(e.createdAt).toLocaleString('ru-RU')}
            </span>
          </button>
        ))}
      </div>
    </Screen>
  )
}
