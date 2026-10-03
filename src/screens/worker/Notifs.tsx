// Уведомления Исполнителя (ТЗ §32): тип, заголовок, текст, время, связь с нарядом,
// статус прочтения.

import { NOTIFICATION_LABELS } from '../../lib/status'
import { Btn, Card, Screen, StatusDot } from '../../components/ui'
import type { WorkerCtx } from './shared'

export default function Notifs({ ctx }: { ctx: WorkerCtx }) {
  const { notifications, unread, markRead, go } = ctx

  return (
    <Screen
      title="Уведомления"
      subtitle={`${unread} непрочитанных из ${notifications.length}`}
      actions={unread > 0 ? <Btn variant="ghost" onClick={() => void markRead()}>Прочитать все</Btn> : undefined}
    >
      {notifications.length === 0 && (
        <p className="text-sm text-neutral-500">Новых уведомлений нет.</p>
      )}
      <div className="flex flex-col gap-2">
        {notifications.map((n) => (
          <Card
            key={n.id}
            onClick={() => {
              if (!n.isRead) void markRead()
              if (n.workOrderId) go({ view: 'detail', id: n.workOrderId })
            }}
            className={n.isRead ? '' : 'border-neutral-900 bg-neutral-50'}
          >
            <div className="flex items-start gap-2">
              {!n.isRead && <StatusDot color="bg-blue-600" />}
              <div className="min-w-0">
                <p className="text-xs text-neutral-500">
                  {NOTIFICATION_LABELS[n.type as keyof typeof NOTIFICATION_LABELS] ?? n.type}
                </p>
                <p className="font-medium">{n.title}</p>
                <p className="mt-0.5 text-sm text-neutral-600">{n.message}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {new Date(n.createdAt).toLocaleString('ru-RU')}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Screen>
  )
}
