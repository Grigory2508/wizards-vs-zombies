// Админ-бот: настройка сложности заданий. Работает и локально (long polling, src/node/index.js),
// и в Supabase (вебхук, supabase/functions/bot). Настройки берутся снимком на каждое действие.
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import {
  PARAM_SCHEMA, describeParams, generateBatch, validateParams, validateSettings,
} from '../core/problems.js';
import { TOPICS, CARDS } from '../core/balance.js';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const pct = (x) => `${Math.round(x * 100)}%`;
const spellOf = (topic) => Object.values(CARDS).find((s) => s.topic === topic);

/**
 * env: { adminIds: number[], webAppUrl: string }
 * game: Game из ./game.js (game.config — настройки с журналом)
 * botInfo: если известен заранее (вебхук), бот не спрашивает его у Telegram при каждом запуске
 */
export function createBot({ token, env, game, botInfo }) {
  const bot = new Bot(token, botInfo ? { botInfo } : undefined);
  const config = game.config;
  const isAdmin = (ctx) => env.adminIds.includes(ctx.from?.id);
  const adminOf = (ctx) => ({ id: ctx.from.id, name: [ctx.from.first_name, ctx.from.username && `@${ctx.from.username}`].filter(Boolean).join(' ') });
  const hasWebApp = env.webAppUrl.startsWith('https://');

  // ---------- Для всех ----------
  bot.command('start', async (ctx) => {
    const kb = hasWebApp ? new InlineKeyboard().webApp('🧙‍♂️ Играть', env.webAppUrl) : undefined;
    await ctx.reply(
      '🏰 <b>Волшебники против Зомби</b>\n\nЗащищай свой замок от волн зомби! Каждое заклинание — это пример по математике: реши его, и магия обрушится на врагов.' +
        (isAdmin(ctx) ? '\n\n🔧 Вы администратор: /admin' : ''),
      { parse_mode: 'HTML', reply_markup: kb },
    );
  });
  bot.command('id', (ctx) => ctx.reply(`Ваш Telegram ID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' }));

  // Всё ниже — только для админов
  const admin = bot.filter(isAdmin);

  // ---------- Экраны ----------
  const screens = {
    main() {
      return {
        text: '🔧 <b>Админка: сложность заданий</b>\n\nВыберите, что настроить. Изменения применяются сразу со следующего боя.',
        kb: new InlineKeyboard()
          .text('📚 Темы и уровни', 'topics').row()
          .text('🎓 Классы', 'gr').text('⚙️ Адаптивность', 'ad').row()
          .text('📊 Статистика', 'st').text('📜 Журнал', 'lg').row()
          .text('💾 Экспорт', 'ex').text('↩️ Отменить последнее', 'un'),
      };
    },
    topics() {
      const kb = new InlineKeyboard();
      for (const [t, name] of Object.entries(TOPICS)) kb.text(`${spellOf(t)?.icon ?? ''} ${name}`, `tp:${t}`).row();
      kb.text('« Назад', 'main');
      return { text: '📚 <b>Темы</b>\nКаждая тема — это заклинание в игре.', kb };
    },
    topic(cfg, topic) {
      const tiers = cfg.topic(topic);
      const kb = new InlineKeyboard();
      tiers.forEach((_, i) => {
        kb.text(`Уровень ${i + 1}`, `tr:${topic}:${i + 1}`);
        if (i % 3 === 2) kb.row();
      });
      kb.row().text('➕ Добавить уровень', `ta:${topic}`);
      if (tiers.length > 1) kb.text('➖ Удалить последний', `td:${topic}`);
      kb.row().text('« Темы', 'topics');
      const lines = tiers.map((p, i) => `<b>Уровень ${i + 1}</b> — пример: <code>${esc(generateBatch(topic, p, 1)[0].q)}</code>`);
      return {
        text: `${spellOf(topic)?.icon ?? ''} <b>${TOPICS[topic]}</b> (${spellOf(topic)?.name ?? ''})\n\n${lines.join('\n')}\n\nИгрок переходит между уровнями автоматически по точности ответов.`,
        kb,
      };
    },
    tier(cfg, topic, n) {
      const p = cfg.topic(topic)[n - 1];
      const kb = new InlineKeyboard();
      for (const [key, def] of Object.entries(PARAM_SCHEMA[topic])) {
        const base = `e:${topic}:${n}:${key}`;
        if (def.type === 'int') {
          kb.text(`${def.label}: ${p[key]}`, 'noop').row();
          for (const s of [...def.steps].reverse()) kb.text(`−${s}`, `${base}:-${s}`);
          for (const s of def.steps) kb.text(`+${s}`, `${base}:${s}`);
          kb.row();
        } else if (def.type === 'bool') {
          kb.text(`${p[key] ? '✅' : '⬜️'} ${def.label}`, `${base}:t`).row();
        } else if (def.type === 'enum') {
          kb.text(`${def.label}: ${p[key]}  🔄`, `${base}:c`).row();
        } else if (def.type === 'set') {
          kb.text(def.label, 'noop').row();
          def.values.forEach((v, i) => {
            kb.text(`${p[key].includes(v) ? '✅' : '·'}${v}`, `${base}:s${v}`);
            if (i % 5 === 4) kb.row();
          });
          kb.row();
        }
      }
      kb.text('👁 Примеры заданий', `pv:${topic}:${n}`).row().text(`« ${TOPICS[topic]}`, `tp:${topic}`);
      return { text: `${spellOf(topic)?.icon ?? ''} <b>${TOPICS[topic]} — уровень ${n}</b>\n\n${describeParams(topic, p)}`, kb };
    },
    grades(cfg) {
      const g = cfg.settings().grades;
      const kb = new InlineKeyboard();
      for (const n of ['1', '2', '3', '4']) kb.text(`${n} класс`, `gr:${n}`);
      kb.row().text('« Назад', 'main');
      const lines = Object.entries(g).map(([n, t]) => `<b>${n} класс:</b> ` + Object.keys(TOPICS).map((k) => `${spellOf(k).icon}${t[k] || '—'}`).join('  '));
      return {
        text: `🎓 <b>Стартовые уровни по классам</b>\nС какого уровня сложности начинает новый ученик. «—» — тема выключена (заклинание использует сложение).\n\n${lines.join('\n')}`,
        kb,
      };
    },
    grade(cfg, n) {
      const g = cfg.settings().grades[n];
      const kb = new InlineKeyboard();
      for (const [t, name] of Object.entries(TOPICS)) {
        kb.text(`${spellOf(t).icon} ${name}: ${g[t] || 'выкл'}`, 'noop').row();
        kb.text('−1', `ge:${n}:${t}:-1`).text('+1', `ge:${n}:${t}:1`).row();
      }
      kb.text('« Классы', 'gr');
      return { text: `🎓 <b>${n} класс — стартовые уровни</b>\nДействует для новых игроков и при смене класса.`, kb };
    },
    adapt(cfg) {
      const s = cfg.settings();
      const kb = new InlineKeyboard()
        .text(`Повышать при ≥ ${pct(s.adaptUp)}`, 'noop').row()
        .text('−5%', 'ae:adaptUp:-0.05').text('+5%', 'ae:adaptUp:0.05').row()
        .text(`Понижать при ≤ ${pct(s.adaptDown)}`, 'noop').row()
        .text('−5%', 'ae:adaptDown:-0.05').text('+5%', 'ae:adaptDown:0.05').row()
        .text(`Окно: ${s.adaptWindow} ответов`, 'noop').row()
        .text('−2', 'ae:adaptWindow:-2').text('+2', 'ae:adaptWindow:2').row()
        .text(`Заданий на тему за бой: ${s.problemsPerTopic}`, 'noop').row()
        .text('−10', 'ae:problemsPerTopic:-10').text('+10', 'ae:problemsPerTopic:10').row()
        .text('« Назад', 'main');
      return {
        text: '⚙️ <b>Адаптивная сложность</b>\n\nПосле каждого боя смотрим последние ответы ученика по теме. Если верных много — уровень темы повышается, если мало — понижается.',
        kb,
      };
    },
    async stats() {
      const s = await game.stats();
      const ans = s.answers.length
        ? s.answers.map((a) => `${spellOf(a.topic)?.icon ?? ''} ${TOPICS[a.topic] ?? a.topic}, ур. ${a.tier}: ${a.correct}/${a.total} (${pct(a.correct / a.total)}), ~${(a.total_ms / a.total / 1000).toFixed(1)} с`).join('\n')
        : 'пока нет ответов';
      const grades = s.grades.map((g) => `${g.grade ?? '?'} кл.: ${g.n}`).join(', ') || '—';
      return {
        text:
          `📊 <b>Статистика</b>\n\nИгроков: <b>${s.players.n}</b> (активных за 7 дней: ${s.active.n})\nПо классам: ${grades}\nСредний уровень мага: ${(s.players.lvl ?? 0).toFixed(1)}, лучшая ночь: ${s.players.best ?? 0}\n` +
          `Боёв: ${s.battles.n ?? 0}, побед: ${s.battles.wins ?? 0}\n\n<b>Точность ответов</b>\n${ans}`,
        kb: new InlineKeyboard().text('🔄 Обновить', 'st').text('« Назад', 'main'),
      };
    },
    async log() {
      const rows = await config.log(12);
      const text = rows.length
        ? rows.map((r) => `#${r.id} ${new Date(r.at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} — ${esc(r.admin_name ?? '?')}: <code>${esc(r.key)}</code> ${esc(r.note)}`).join('\n')
        : 'Изменений пока не было.';
      return { text: `📜 <b>Журнал изменений</b>\n\n${text}`, kb: new InlineKeyboard().text('↩️ Отменить последнее', 'un').text('« Назад', 'main') };
    },
  };

  const show = async (ctx, screen) => {
    const { text, kb } = await screen;
    const opts = { parse_mode: 'HTML', reply_markup: kb };
    if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(text, opts);
      } catch (e) {
        if (!String(e.description).includes('not modified')) throw e;
      }
    } else await ctx.reply(text, opts);
  };

  // ---------- Команды ----------
  admin.command('admin', (ctx) => show(ctx, screens.main()));
  admin.command('topics', (ctx) => show(ctx, screens.topics()));
  admin.command('grades', async (ctx) => show(ctx, screens.grades(await config.load())));
  admin.command('stats', (ctx) => show(ctx, screens.stats()));
  admin.command('log', (ctx) => show(ctx, screens.log()));
  admin.command('export', (ctx) => sendExport(ctx));
  admin.command('undo', (ctx) => doUndo(ctx));
  admin.command('import', (ctx) => ctx.reply('Пришлите JSON-файл, полученный через /export (можно отредактировать). Он заменит текущие настройки.'));
  admin.command('preview', async (ctx) => {
    const [topic, n] = ctx.match.split(/\s+/);
    if (!TOPICS[topic]) return ctx.reply(`Формат: /preview тема уровень\nТемы: ${Object.keys(TOPICS).join(', ')}`);
    await sendPreview(ctx, topic, Number(n) || 1);
  });
  admin.command('help', (ctx) =>
    ctx.reply(
      '/admin — главное меню\n/topics — темы и уровни\n/grades — стартовые уровни по классам\n/preview addsub 2 — примеры заданий\n/stats — статистика\n/log — журнал изменений\n/undo — отменить последнее изменение\n/export — скачать настройки (JSON)\n/import — загрузить настройки из JSON',
    ),
  );

  async function sendPreview(ctx, topic, n) {
    const tiers = (await config.load()).topic(topic);
    if (n < 1 || n > tiers.length) return ctx.reply(`У темы ${n > 0 ? 'только' : ''} ${tiers.length} уровней`);
    const probs = generateBatch(topic, tiers[n - 1], 10);
    await ctx.reply(`👁 <b>${TOPICS[topic]}, уровень ${n}</b>\n\n${probs.map((p) => `<code>${esc(p.q)}</code>  → ${esc(p.answer)}   <i>(${p.options.map(esc).join(' / ')})</i>`).join('\n')}`, {
      parse_mode: 'HTML',
    });
  }

  async function sendExport(ctx) {
    const data = JSON.stringify((await config.load()).exportAll(), null, 2);
    await ctx.replyWithDocument(new InputFile(new TextEncoder().encode(data), `difficulty-${new Date().toISOString().slice(0, 10)}.json`), {
      caption: 'Настройки сложности. Отредактируйте и пришлите файлом обратно — бот их применит.',
    });
  }

  async function doUndo(ctx) {
    const last = await config.undo(adminOf(ctx));
    const msg = last ? `↩️ Отменено изменение #${last.id} (${last.key})` : 'Нечего отменять';
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery(msg);
      return show(ctx, screens.log());
    }
    return ctx.reply(msg);
  }

  // ---------- Кнопки ----------
  admin.callbackQuery('noop', (ctx) => ctx.answerCallbackQuery());
  admin.callbackQuery('main', (ctx) => show(ctx, screens.main()));
  admin.callbackQuery('topics', (ctx) => show(ctx, screens.topics()));
  admin.callbackQuery('gr', async (ctx) => show(ctx, screens.grades(await config.load())));
  admin.callbackQuery('ad', async (ctx) => show(ctx, screens.adapt(await config.load())));
  admin.callbackQuery('st', (ctx) => show(ctx, screens.stats()));
  admin.callbackQuery('lg', (ctx) => show(ctx, screens.log()));
  admin.callbackQuery('ex', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendExport(ctx);
  });
  admin.callbackQuery('un', (ctx) => doUndo(ctx));
  admin.callbackQuery(/^tp:(\w+)$/, async (ctx) => show(ctx, screens.topic(await config.load(), ctx.match[1])));
  admin.callbackQuery(/^tr:(\w+):(\d+)$/, async (ctx) => show(ctx, screens.tier(await config.load(), ctx.match[1], Number(ctx.match[2]))));
  admin.callbackQuery(/^gr:(\d)$/, async (ctx) => show(ctx, screens.grade(await config.load(), ctx.match[1])));
  admin.callbackQuery(/^pv:(\w+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendPreview(ctx, ctx.match[1], Number(ctx.match[2]));
  });

  // Добавить / удалить уровень темы
  admin.callbackQuery(/^t([ad]):(\w+)$/, async (ctx) => {
    const [, action, topic] = ctx.match;
    const tiers = structuredClone((await config.load()).topic(topic));
    if (action === 'a') {
      if (tiers.length >= 10) return ctx.answerCallbackQuery('Максимум 10 уровней');
      tiers.push(structuredClone(tiers.at(-1)));
    } else {
      if (tiers.length <= 1) return ctx.answerCallbackQuery('Должен остаться хотя бы 1 уровень');
      tiers.pop();
    }
    await config.set(`topic:${topic}`, tiers, adminOf(ctx), action === 'a' ? `добавлен уровень ${tiers.length}` : 'удалён последний уровень');
    await ctx.answerCallbackQuery(action === 'a' ? 'Добавлен (копия последнего) — настройте его' : 'Удалён');
    const cfg = await config.load();
    await show(ctx, action === 'a' ? screens.tier(cfg, topic, tiers.length) : screens.topic(cfg, topic));
  });

  // Изменение параметра уровня
  admin.callbackQuery(/^e:(\w+):(\d+):(\w+):(.+)$/, async (ctx) => {
    const [, topic, nStr, key, op] = ctx.match;
    const n = Number(nStr);
    const def = PARAM_SCHEMA[topic]?.[key];
    const tiers = structuredClone((await config.load()).topic(topic) ?? []);
    const p = tiers[n - 1];
    if (!def || !p) return ctx.answerCallbackQuery('Устаревшая кнопка');
    let v = p[key];
    if (def.type === 'int') v = Math.min(def.max, Math.max(def.min, v + Number(op)));
    else if (def.type === 'bool') v = !v;
    else if (def.type === 'enum') v = def.values[(def.values.indexOf(v) + 1) % def.values.length];
    else if (def.type === 'set') {
      const x = Number(op.slice(1));
      v = v.includes(x) ? v.filter((y) => y !== x) : [...v, x];
      if (!v.length) return ctx.answerCallbackQuery('Нужна хотя бы одна таблица');
    }
    if (JSON.stringify(v) === JSON.stringify(p[key])) return ctx.answerCallbackQuery('Достигнута граница');
    tiers[n - 1] = validateParams(topic, { ...p, [key]: v });
    await config.set(`topic:${topic}`, tiers, adminOf(ctx), `ур.${n} ${key}: ${JSON.stringify(p[key])} → ${JSON.stringify(tiers[n - 1][key])}`);
    await ctx.answerCallbackQuery('Сохранено');
    await show(ctx, screens.tier(await config.load(), topic, n));
  });

  // Стартовые уровни класса
  admin.callbackQuery(/^ge:(\d):(\w+):(-?\d+)$/, async (ctx) => {
    const [, g, topic, d] = ctx.match;
    const cfg = await config.load();
    const s = structuredClone(cfg.settings());
    const max = cfg.topic(topic).length;
    const min = topic === 'addsub' ? 1 : 0;
    const v = Math.min(max, Math.max(min, s.grades[g][topic] + Number(d)));
    if (v === s.grades[g][topic]) return ctx.answerCallbackQuery(`Допустимо ${min}…${max}`);
    s.grades[g][topic] = v;
    await config.set('settings', validateSettings(s), adminOf(ctx), `${g} класс ${topic} → ${v}`);
    await ctx.answerCallbackQuery('Сохранено');
    await show(ctx, screens.grade(await config.load(), g));
  });

  // Адаптивность
  admin.callbackQuery(/^ae:(\w+):(-?[\d.]+)$/, async (ctx) => {
    const [, key, d] = ctx.match;
    const s = structuredClone((await config.load()).settings());
    const nv = Math.round((s[key] + Number(d)) * 100) / 100;
    try {
      await config.set('settings', validateSettings({ ...s, [key]: nv }), adminOf(ctx), `${key}: ${s[key]} → ${nv}`);
    } catch (e) {
      return ctx.answerCallbackQuery(e.message.slice(0, 190));
    }
    await ctx.answerCallbackQuery('Сохранено');
    await show(ctx, screens.adapt(await config.load()));
  });

  // Импорт настроек из JSON-файла
  admin.on('message:document', async (ctx) => {
    const doc = ctx.message.document;
    if (!doc.file_name?.endsWith('.json')) return;
    if (doc.file_size > 200_000) return ctx.reply('Файл слишком большой');
    try {
      const file = await ctx.getFile();
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
      const data = JSON.parse(await res.text());
      const updates = [];
      for (const [key, value] of Object.entries(data)) {
        if (key === 'settings') updates.push([key, validateSettings(value)]);
        else if (key.startsWith('topic:') && PARAM_SCHEMA[key.slice(6)]) {
          const topic = key.slice(6);
          if (!Array.isArray(value) || !value.length || value.length > 10) throw new Error(`${key}: от 1 до 10 уровней`);
          updates.push([key, value.map((p) => validateParams(topic, p))]);
        } else throw new Error(`Неизвестный ключ: ${key}`);
      }
      for (const [key, value] of updates) await config.set(key, value, adminOf(ctx), 'импорт из файла');
      await ctx.reply(`✅ Импортировано: ${updates.map(([k]) => k).join(', ')}\nОтменить: /undo (по одному ключу)`);
    } catch (e) {
      await ctx.reply(`❌ Не удалось импортировать: ${e.message}`);
    }
  });

  bot.on('callback_query:data', (ctx) => ctx.answerCallbackQuery('Нет доступа'));

  return bot;
}


/**
 * Меню команд и кнопка «Играть» в чате. Вызывается один раз: при запуске локального сервера
 * и при выкладке в Supabase (scripts/bot-setup.mjs), а не на каждое сообщение.
 * api — объект с методами Bot API (bot.api из grammY).
 */
export async function setupBot(api, env) {
  const ok = (p) => p.catch(() => {});
  await ok(api.setMyCommands([{ command: 'start', description: 'Начать игру' }]));
  for (const id of env.adminIds) {
    await ok(
      api.setMyCommands(
        [
          { command: 'start', description: 'Начать игру' },
          { command: 'admin', description: 'Админка сложности' },
          { command: 'stats', description: 'Статистика' },
          { command: 'undo', description: 'Отменить последнее изменение' },
          { command: 'help', description: 'Все команды' },
        ],
        { scope: { type: 'chat', chat_id: id } },
      ),
    );
  }
  if (env.webAppUrl.startsWith('https://')) {
    await ok(api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Играть', web_app: { url: env.webAppUrl } } }));
  }
}
