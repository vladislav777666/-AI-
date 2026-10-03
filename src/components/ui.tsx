// Общие UI-атомы модуля «Мастер» (Tailwind 4, минимализм в стиле проекта).

import type { ReactNode } from 'react'

export function Screen({ title, subtitle, children, actions }: {
  title: string
  subtitle?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Card({ children, onClick, className = '' }: {
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  const base = 'border border-neutral-200 bg-white p-4 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} transition-colors hover:border-neutral-900 ${className}`}>
      {children}
    </button>
  ) : (
    <div className={`${base} ${className}`}>{children}</div>
  )
}

export function Field({ label, children, required }: {
  label: string
  children: ReactNode
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-neutral-500">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full border border-neutral-300 bg-white px-3 py-2.5 text-base placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} min-h-24 ${props.className ?? ''}`} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ''}`} />
}

export function Btn({ variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}) {
  const styles = {
    primary: 'border-neutral-900 bg-neutral-900 text-white hover:bg-white hover:text-neutral-900',
    ghost: 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-900 hover:text-neutral-900',
    danger: 'border-red-600 bg-white text-red-600 hover:bg-red-600 hover:text-white',
  }[variant]
  return (
    <button
      type="button"
      {...props}
      className={`border px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400 ${styles} ${props.className ?? ''}`}
    />
  )
}

export function StatusDot({ color }: { color: string }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="whitespace-nowrap text-sm" title={`${value} из 5`}>
      {'★'.repeat(Math.round(value))}
      <span className="text-neutral-300">{'★'.repeat(5 - Math.round(value))}</span>
      <span className="ml-1 text-neutral-500">{value.toFixed(1)}</span>
    </span>
  )
}

export interface NavItem {
  key: string
  label: string
  icon: string
}

/** Нижняя панель навигации для телефона (скрывается на десктопе). */
export function BottomNav({ items, activeKey, onSelect }: {
  items: NavItem[]
  activeKey: string
  onSelect: (key: string) => void
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5">
        {items.map((it) => {
          const active = it.key === activeKey
          return (
            <button
              key={it.key}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelect(it.key)}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] leading-tight transition-colors ${
                active ? 'font-semibold text-neutral-900' : 'text-neutral-500'
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>{it.icon}</span>
              <span className="max-w-full truncate">{it.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
