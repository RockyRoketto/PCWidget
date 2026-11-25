// Записывает лимиты и заполненность контекста в pcwidget-limits.json. Только числа; к модели не обращается.
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

async function save($: EngineInterface, context: SessionContextUsage, limits: readonly SessionRateLimit[]) {
  if (limits.length === 0) return // чат ещё не получал ответа: прежний файл не трогаем
  try {
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home ? `${home}/.claude` : undefined)
    if (!dir) return
    const body = {
      at: await $.clock.now(),
      limits: limits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
      context: { tokens: context.tokens, window: context.window, percent: context.percent },
    }
    await $.fs.write(`${dir}/pcwidget-limits.json`, JSON.stringify(body))
  } catch {
    // запись не удалась: работе чата это мешать не должно
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const u = await $.session.usage()
    await save($, u.context, u.rateLimits)
    return result
  })
  on('session.measure', async ($, e, next) => {
    await save($, e.context, e.rateLimits)
    return next(e)
  })
}
