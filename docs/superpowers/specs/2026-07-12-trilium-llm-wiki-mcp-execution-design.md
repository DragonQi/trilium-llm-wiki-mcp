# Дизайн оркестрации исполнения

> Дополнение к мастер-спецификации [`2026-07-12-trilium-llm-wiki-mcp-prompt.md`](./2026-07-12-trilium-llm-wiki-mcp-prompt.md).
> Фиксирует принятые на старте решения и то, как пофазный план §7 превращается в
> workflow-раунды с распараллеливанием. Дата: 2026-07-12.

---

## 1. Принятые решения (brainstorming-сессия)

| # | Решение | Значение | Влияние на план |
|---|---------|----------|-----------------|
| 1 | **Стратегия исполнения** | Workflow-оркестрация (мульти-агентная) | Каждая фаза → отдельный workflow-раунд; распараллеливание внутри раундов через `pipeline`/`parallel`. |
| 2 | **Среда Trilium** | Docker доступен | Phase 0 пишет `docker-compose.yml` (`triliumnext/notes`, volume `./trilium-data`, порт 8080) и поднимает инстанс; ETAPI-токен через `POST /etapi/auth/login`. Integration/E2E идут против него. |
| 3 | **Референс MCP** | Clean-room с нуля | Phase 1 = написать ETAPI-клиент + transport (stdio) + 18 базовых инструментов с нуля по ETAPI-спеке TriliumNext. **Никакого стороннего исходного кода в репо.** Концепцию LLM-wiki А. Карпатого атрибутируем в README. |
| 4 | **Лицензия проекта** | **MIT** | Стандарт для npm, максимальная совместимость. Не copyleft, fork-friendly. Атрибуция концепции Карпатого и упоминание ETAPI TriliumNext в NOTICE/README. |

### Почему именно так

- **Clean-room** соответствует §3.4 спеки («все паттерны реализуем с нуля своим кодом; сторонний GPL/copyleft-source не vendorm») и устраняет любые лицензионные риски. Расширение референса заменяется самостоятельной реализацией по ETAPI-спеке.
- **Docker** — канонический путь §6.1; даёт детерминированную тестовую среду и воспроизводимость на любом ПК (требование multi-PC §4.5).
- **Workflow** — спека явно рекомендует режим `ultracode` для распараллеливания фаз 2 и 4; здесь это реализовано как последовательность workflow-раундов.

---

## 2. Структура оркестрации — 8 раундов

Раунды идут последовательно (каждый со своим DoD из §7 спеки). Внутри раундов —
веерное распараллеливание агентов.

| Раунд | Фаза | Что делает | Параллелизм внутри |
|---|---|---|---|
| **WF0** | 0 — Scaffold + Trilium | npm/TS-инициализация, ESLint/Prettier, Vitest, `docker-compose.yml`, подъём TriliumNext, ETAPI-токен, `app-info` healthcheck | последовательный (фундамент) |
| **WF1** | 1 — Ядро MCP | ETAPI-клиент (`src/etapi/`), stdio-transport, 18 базовых инструментов clean-room | `pipeline`: клиент → 4 группы инструментов параллельно → unit-тесты |
| **WF2** | 2 — Расширение MCP | ~28 ETAPI-инструментов + композитные + graph-слой | **максимум**: 8 групп инструментов отдельными агентами + graph-слой (`find_related`, `query_wiki`) |
| **WF3** | 3 — Companion-CLI | `trilium-wiki`: `init`, `brief`, `checkpoint`, `install`, `doctor` на общем ETAPI-клиенте | команды параллельно после скелета CLI |
| **WF4** | 4 — `SKILL.md` | процессы ingest/query/lint/delete + hard rules, trigger-discipline | секции скилла параллельно |
| **WF5** | 5 — Хуки | блок SessionStart/Stop в `settings.json`, пример в репо | короткий, последовательный |
| **WF6** | 6 — E2E методологии | 5 приёмочных сценариев §6.3 против живого Trilium | сценарии как pipeline |
| **WF7** | 7 — Документация/упаковка | README, `.mcp.json` (env-driven), npm publish-подготовка, multi-PC quickstart | секции README параллельно |

### Группы инструментов WF2 (для распараллеливания)

1. **Контент + Revisions** — `get_note_content`, `create_note_revision`, `list_note_revisions`, `get_revision`, `get_revision_content`
2. **Branches/clone** — `clone_note`, `get_branch`, `update_branch`, `delete_branch`, `refresh_note_ordering`
3. **Attachments** — `create_attachment`, `get_attachment`, `list_note_attachments`, `update_attachment`, `delete_attachment`, `get_attachment_content`, `set_attachment_content`
4. **Attributes+** — `get_attribute`, `update_attribute`
5. **Export/Import** — `export_note_subtree`, `import_note_zip`
6. **History** — `undelete_note`, `get_recent_changes`
7. **Calendar+ / Системные** — `get_week_note_by_date`, `get_month_note`, `get_year_note`, `login`, `logout`, `create_backup`, `get_metrics`
8. **Композитные** — `upsert_note`, `get_backlinks`, `find_orphans`, `search_by_attribute`, `replace_note_section`, `bulk_set_attributes`
9. **Graph/Relevance** (отдельный поток, зависит от ETAPI-клиента) — `find_related` (4-signal), `query_wiki`, `resolve_review`, `deep_research`

### Совмещение раундов (сокращение стеночного времени)

- **WF3 (CLI)** и **WF4 (SKILL)** стартуют, как только WF1 дал ETAPI-клиент, а WF2 дал описания инструментов — им не нужна полная реализация всех инструментов, только контракты. Я буду использовать это.
- **WF5 (хуки)** зависит только от WF3 (CLI) — короткий хвост.

---

## 3. Ритм отчётности

Между раундами — короткий отчёт: созданные файлы, статус DoD фазы, результаты
тестов, открытые вопросы. Это не чекпоинт-блокировка (выбрана workflow-стратегия),
но прозрачность по ходу. Крупные архитектурные сюрпризы выносятся на явное решение.

---

## 4. Соответствие Definition of Done спеки (§8)

Раунды WF0–WF7 совместно закрывают все 5 пунктов DoD:

1. Пакет собирается, инструменты покрыты integration-тестами → **WF1, WF2, WF6**
2. Скилл + хоки работают в реальной сессии → **WF4, WF5**
3. E2E методологии зелёный → **WF6**
4. README + `.mcp.json` + лицензия + атрибуция → **WF0 (license/NOTICE), WF7**
5. Типобезопасность, линт, атомарные коммиты → **все раунды** (zod-схемы, ESLint/Prettier на каждом шаге)

---

*Версия документа: 1.0. Основано на спецификации v1.2 и решениях brainstorming-сессии 2026-07-12.*
