// Обезличивание персональных данных перед отправкой во внешний ИИ.
//
// PDF §9 «Безопасность и надёжность»: персональные данные сотрудников не
// передаются во внешние сервисы без обезличивания. Поэтому внешней модели
// уходят только псевдонимы «Сотрудник-NN»; настоящие ФИО восстанавливаются в
// ответе модели уже на клиенте и никуда не отправляются.

/** Модель может вернуть псевдоним с любым дефисом (обычный «-», неразрывный
 *  «‑» U+2011, короткое/длинное тире) и с пробелами вокруг него — учитываем это
 *  при восстановлении ФИО, иначе «Сотрудник‑02» остался бы в ответе. */
function aliasRegex(alias: string): RegExp {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = alias.split('-').map(escape)
  return new RegExp(parts.join('[\\s\\-\\u2010-\\u2015]{0,3}'), 'gi')
}

export interface Anonymizer {
  /** Псевдоним сотрудника по его id (или «—», если сотрудник неизвестен). */
  alias(workerId: string | null | undefined): string
  /** Вернуть настоящие ФИО в текст, полученный от модели. */
  restore(text: string): string
}

/** Псевдонимы стабильны в рамках одного вызова: один id → один «Сотрудник-NN». */
export function createAnonymizer(
  workers: ReadonlyArray<{ id: string; fullName: string }>,
): Anonymizer {
  const idToAlias = new Map<string, string>()
  const aliasToName = new Map<string, string>()
  workers.forEach((w, index) => {
    const alias = `Сотрудник-${String(index + 1).padStart(2, '0')}`
    idToAlias.set(w.id, alias)
    if (!aliasToName.has(alias)) aliasToName.set(alias, w.fullName)
  })
  return {
    alias: (workerId) => (workerId && idToAlias.get(workerId)) || '—',
    restore: (text) => {
      let out = text
      for (const [alias, name] of aliasToName) out = out.replace(aliasRegex(alias), name)
      return out
    },
  }
}
