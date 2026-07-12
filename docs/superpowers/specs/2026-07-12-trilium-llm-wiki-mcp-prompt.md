# Идеальный промпт: Trilium LLM-Wiki MCP + скилл методологии Карпатого

> **Как использовать этот документ.** Это мастер-промпт с фазами (подход B). Его можно отдать Claude Code одной пачкой (целиком) или пофазно — каждая фаза самодостаточна и имеет свой Definition of Done. Документ самодостаточен: ключевые референсы вшиты inline, внешних зависимостей от контекста другой сессии нет. Рекомендуемый режим выполнения — `ultracode` (xhigh + динамическая workflow-оркестрация): фазы 2 и 4 выгодно распараллеливать.
>
> Цель: получить **(1)** npm-пакет MCP-сервера для Trilium Notes (расширенный сверх референса `trilium-notes-mcp`) и **(2)** скилл + хуки для Claude Code, реализующие методологию LLM-wiki Андре Карпатого, где **Trilium выступает единым backend'ом wiki** (а не локальные markdown-файлы).

---

## 1. Роль и миссия

Ты — старший инженер, проектирующий и собирающий систему «LLM-wiki поверх Trilium Notes» для Claude Code. Ты работаешь в репозитории `D:\Projects\trilium-llm-wiki-mcp` (Windows, Git Bash, чистый лист — только initial commit).

Ты строишь **два поставляемых артефакта** и их связку:

- **Артефакт 1 — Trilium MCP.** MCP-сервер (Model Context Protocol, stdio) на TypeScript, дающий агенту полный доступ к Trilium/TriliumNext через ETAPI. Это «руки» системы.
- **Артефакт 2 — LLM-wiki Skill + хуки.** Claude Code Skill (`SKILL.md`), кодирующий методологию Карпатого (операции ingest/query/lint) поверх Trilium, плюс хуки автоматизации. Это «мозг/schema» системы.

Связка: **MCP = руки, Skill = мозг.** Скилл описывает *как* вести wiki (workflow), MCP даёт *чем* это делать (инструменты). Trilium — единое хранилище правды: notes = страницы, relations = типизированный граф, labels = структурированные метаданные, встроенный поиск = «карта».

---

## 2. Контекст и заблокированные решения

### Заблокированные решения (не пересматривать без явного запроса)

| # | Решение | Значение |
|---|---------|----------|
| 1 | Хранилище wiki | **Trilium — единый backend.** Весь wiki живёт в Trilium, доступ только через MCP. Никаких локальных markdown-файлов как источника правды. |
| 2 | Подход к MCP | **Расширить референс `trilium-notes-mcp` (TypeScript).** Взять за основу готовый пакет, сохранить его 18 инструментов, добавить недостающие ETAPI-эндпоинты. |
| 3 | Автоматизация | **Скилл + хуки.** `SKILL.md` = schema + процессы ingest/query/lint; хуки SessionStart/Stop для автоматизации. |
| 4 | Результат | Полностью собрать и протестировать оба артефакта против живого локального Trilium. |

### Принятые допущения (adjustable — менять можно, но зафиксировано по умолчанию)

- **Движок заметок:** TriliumNext Notes (активный форк; оригинальный `zadam/trilium` архивирован). ETAPI у них идентичен для общих эндпоинтов.
- **Развёртывание для тестов:** локальный TriliumNext через **Docker** (`docker-compose.yml` в репо, persistent volume, порт 8080). Если Docker недоступен — нативный запуск Node.js-клонки TriliumNext.
- **Транспорт MCP:** stdio (стандарт для локальных MCP в Claude Code).
- **Аутентификация ETAPI:** header `Authorization: <token>` (без префикса `Bearer`). Токен передаётся через env `TRILIUM_TOKEN`, URL — `TRILIUM_URL` (как в референсе).
- **Среда:** Windows 11, Git Bash (POSIX-синтаксис), Node.js ≥ 18.
- **Язык комментариев/документации:** английский в коде (соглашения референса); пользовательские тексты — русский.

---

## 3. Референсные материалы (inline)

### 3.1. Референс `trilium-notes-mcp` v0.4.3 — что есть и где пробелы

Node.js MCP-сервер, обёртка над ETAPI. 18 инструментов в 4 группах:

- **Чтение/поиск:** `search_notes`, `get_note`, `get_note_tree` (дети, макс. 50), `get_note_subtree` (рекурсивно, макс. 100 узлов / 20 на узел), `get_note_path` (предки), `get_app_info`.
- **Запись/редактирование:** `create_note`, `update_note` (title/type/mime), `update_note_content` (полная замена), `append_to_note`, `delete_note`, `move_note` (move/clone).
- **Атрибуты:** `get_attributes`, `set_attribute` (upsert label/relation), `delete_attribute`.
- **Календарь/журнал:** `get_day_note`, `get_week_note`, `get_inbox_note`.

Известные ограничения референса: read-then-write у content-операций (гонки); хард-капы на tree/subtree; `move_note` без `branchId` клонирует; binary-notes возвращают placeholder; protected notes не поддерживаются.

**Пробелы (что закрываем):** branches/клонирование как first-class, attachments (файлы/изображения), revisions (история), export/import, bulk-операции, backlinks/relations-навигация, секционное редактирование контента, расширенные attributes, calendar (month/year), системные операции. Полный список — в секции 4.2.

### 3.2. Методология Карпатого (LLM Wiki) — выжимка

Три слоя:
1. **Raw sources** — неизменный источник правды. LLM только читает.
2. **The wiki** — LLM-генерируемые страницы: summaries, entity-pages, concept-pages, overview, synthesis. LLM владеет этим слоем целиком.
3. **The schema** — документ (CLAUDE.md/AGENTS.md ≡ наш `SKILL.md`), говорящий LLM структуру, конвенции и workflow. Ключевой конфиг; ко-эволюционирует.

Три операции:
- **Ingest** — добавить источник → LLM читает, обсуждает, пишет summary-страницу, обновляет index, обновляет затронутые entity/concept-страницы, дописывает log. **Один источник ≈ 10–15 страниц.**
- **Query** — вопрос → LLM читает index → drill в релевантные страницы → синтез с цитатами. Хорошие ответы filed обратно как новые synthesis-страницы.
- **Lint** — health-check: противоречия, устаревшие утверждения, orphans (без входящих ссылок), пропущенные страницы, пропущенные cross-refs, data-gaps. Периодически; предлагает новые вопросы/источники.

Особые файлы:
- **index.md** — контентный каталог (ссылка + однострочное summary + метаданные), по категориям. LLM читает index *первым*, чтобы найти релевантные страницы.
- **log.md** — хронологический append-only, префикс `## [YYYY-MM-DD] op | Title`, парсится `grep`.

Критические принципы из обсуждения гиста:
- **«Schema — это всё».** Качество SKILL.md определяет качество wiki.
- **Drift — враг №1.** Lint обязателен, не опционален. Главный failure-mode — under-update cross-refs при ingest.
- **«Map, not bodies».** Не давать агенту читать тела страниц ради поиска. Сначала «карта» (index + поиск по атрибутам + соседи/кластер), выбрать ~10 страниц, *только потом* читать тела.
- **Новая страница vs правка:** новая страница — когда это отдельная сущность/концепция, на которую сошлёшься откуда-то ещё; правка на месте — когда это атрибут/обновление существующего.
- **Confidence/lifecycle-метка на каждой странице** (weak/moderate/strong) — знать, что перепроверить при новом источнике.

### 3.3. Таблица маппинга Karpathy → Trilium (почему Trilium — сильный backend)

| Karpathy (markdown/Obsidian) | Реализация в Trilium | Выигрыш |
|---|---|---|
| `raw/` директория | subtree `Raw/`, notes с `#wikiLayer=raw` | immutable, изолировано |
| `wiki/*.md` страницы | notes в `Wiki/{Summaries,Concepts,Entities,Overview,Synthesis}` | tree-структура бесплатно |
| `[[wikilinks]]` перекрёстные ссылки | типизированные **relations** (`relatesTo`, `derivedFrom`, `contradicts`, `supersedes`) | строго богаче: направленные, типизированные, queryable |
| YAML frontmatter | Trilium **labels** (`#status`, `#updated`, `#sources`, `#wikiType`) | queryable: `#status=weak` |
| `index.md` каталог | note `Index` (одна строка на страницу) | централизованная карта |
| `log.md` append-only | note `Log` (`append_to_note`, `## [date] op | title`) + опц. day-notes | parseable + Trilium-календарь |
| qmd / BM25 / vector search | встроенный полнотекстовый + attribute-поиск Trilium | **без отдельной инфраструктуры поиска** |
| git history | revisions (per-note version history) | версия каждой страницы |
| graph view Obsidian | relation-graph + note-tree Trilium | визуализация графа |
| CLAUDE.md schema | `SKILL.md` скилла | единый конфиг workflow |

### 3.4. Усиления методологии (дизайн-решения поверх базового паттерна)

Базовый паттерн Карпатого намеренно абстрактный. Ниже — конкретные инженерные решения, которые мы закладываем, чтобы wiki был устойчив при росте (drift — главный враг) и естественно ложился на типизированный граф Trilium. Все паттерны реализуем **своим кодом** на TypeScript поверх Trilium relations/labels; для графа используем публичные библиотеки `graphology` и `graphology-communities-louvain` (MIT).

**Дизайн-карта (возможность → реализация на Trilium):**

| Возможность | Реализация на Trilium | Секция | Приоритет |
|---|---|---|---|
| `Purpose` — «зачем wiki» (goal/key questions/scope/thesis) | note `Purpose` в корне vault'а; SKILL читает её на каждом ingest+query | 5.1, 5.3 | v1 |
| Two-step CoT ingest (analyze → generate) | INGEST = 2 прохода: Analysis (entities/concepts/contradictions/connections-to-existing) → Generation (pages + Index + Log + Overview + review items + search queries) | 5.3 | v1 |
| Page-type enum + доменный frontmatter | `#wikiType` enum (entity/concept/source/query/comparison/synthesis/overview + доменные); scenario-templates | 5.2 | v1 |
| `Overview` auto-update на каждом ingest | INGEST всегда регенерирует Overview | 5.3 | v1 |
| SHA256 incremental cache | label `#contentHash` на raw-note; skip re-ingest если хеш совпал И все derived-страницы на месте | 5.2, 5.3 | v1 |
| Contradiction-handling protocol | note в concept/entity → `query`-страница → `contradicts`/`supersedes` relations → resolve в synthesis | 5.3 | v1 |
| Review queue (async, predefined actions, pre-generated search queries) | subtree `Review/` + ReviewItem-семантика (type, options, searchQueries); dedupe by type+title | 5.1, 5.3 | v1 |
| Cascade delete cleanup | DELETE raw → удалить derived summary/synthesis; у shared entity убрать источник из `#sources`; почистить Index и мёртвые relations | 5.3 | v1 |
| 4-signal relevance (directLink×3 + sourceOverlap×4 + Adamic-Adar×1.5 + typeAffinity×1) | composite-инструмент `find_related`: directLink=relations, sourceOverlap=общие `derivedFrom`, commonNeighbor=общие цели relations, typeAffinity=`#wikiType`-матрица | 4.2, 5.3 | v1 |
| Retrieval pipeline + token-budget + numbered citations | QUERY: search → graph expansion (`find_related`, 2-hop decay) → бюджет 60/20/5/15 → assembly с [1][2]-цитатами | 5.3, 5.5 | v1 |
| Trigger discipline (positive + явный negative-list) | frontmatter SKILL: trigger ONLY на «my wiki / LLM Wiki / wiki»; НЕ trigger на «search my notes / Obsidian / Notion»; «в сомнении — спроси» | 5.3 | v1 |
| Shared ETAPI client | ОДИН ETAPI-клиент-модуль используется и MCP-сервером, и companion-CLI — никаких двух параллельных реализаций | 4.1, 5.4 | v1 |
| Louvain communities + cohesion (lint signal) | `graphology-communities-louvain` поверх relation-graph; sparse communities (<0.15), bridge nodes, isolated pages как knowledge-gaps | 5.3 | v1.5 |
| Graph insights (surprising connections) | cross-community/cross-type edges, composite surprise score | 5.3 | v1.5 |
| Deep Research как ingest-path | WebSearch (нативный Claude Code) → synthesis research-страница → auto-ingest; search-queries из review items | 5.3 | v1.5 |
| Scenario templates (Research/Reading/Personal/Business/General) | пресеты purpose+schema+extra page-types при `trilium-wiki init` | 5 | v1.5 |
| `dataVersion` signaling | bump версии на корне vault при мутации; кеш графа по версии | 4, 5 | v1.5 |
| Десктоп-GUI, собственный vector-движок, многоформатный парсинг документов, chat-persistence, i18n | — (это не desktop-приложение; Claude Code сам парсит PDF/код, поиск = встроенный Trilium) | — | non-goal |

**Лицензия и чистота реализации:**
- Все паттерны реализуем **с нуля своим кодом/текстом**; сторонний (в т.ч. любой GPL/copyleft) исходный код в проект не vendorm.
- Базовый MCP-референс `trilium-notes-mcp` (MIT) расширяем с соблюдением его лицензии и атрибуции.
- Проект лицензируем **MIT или Apache-2.0** — fork-friendly, без copyleft.
- Базовая методология LLM-wiki — публичный паттерн А. Карпатого; реализация полностью самостоятельная.

---

## 4. Артефакт 1 — Trilium MCP (расширенный)

### 4.1. Архитектура

- Стек: **TypeScript + ESM**, на основе исходников `trilium-notes-mcp`.
- Слои:
  1. **ETAPI-клиент** (`src/etapi/client.ts`) — **единый** type-safe модуль над REST: base URL + auth header, типизированные методы, общая обработка ошибок (ETAPI возвращает `{status, code, message}`; `code` — стабильная строка, напр. `NOTE_NOT_FOUND`, `NOTE_IS_PROTECTED`). **Используется и MCP-сервером, и companion-CLI** — двух параллельных реализаций быть не должно (fix companion-CLI smell).
  2. **MCP-инструменты** (`src/tools/*.ts`) — тонкая, well-documented трансляция ETAPI → MCP tool surface. Каждый инструмент: человекочитаемое описание, type-safe input schema (zod), осмысленные ошибки.
  3. **Графовый слой** (`src/graph/`) — поверх Trilium relations: `graphology` + `graphology-communities-louvain` (MIT-либы). Питает relevance-модель (`find_related`), community-detection (lint). v1 — relevance; v1.5 — communities.
  4. **Транспорт** (`src/index.ts`) — stdio MCP-сервер.
- Конфиг через env: `TRILIUM_URL`, `TRILIUM_TOKEN`. Опционально `TRILIUM_TIMEOUT`, `TRILIUM_VERIFY_TLS`.
- Пагинация: ETAPI **не имеет** cursor/offset-пагинации (только `?limit=` у поиска). Снять хард-капы референса (50/100) — выставить параметры `limit`/`depth` наружу с разумными дефолтами и защитой от гигантских выгрузок.

### 4.2. Полный список инструментов

**Сохраняем из референса (18):** `search_notes`, `get_note`, `get_note_tree`, `get_note_subtree`, `get_note_path`, `get_app_info`, `create_note`, `update_note`, `update_note_content`, `append_to_note`, `delete_note`, `move_note`, `get_attributes`, `set_attribute`, `delete_attribute`, `get_day_note`, `get_week_note`, `get_inbox_note`.

**Добавляем новые (~28), сгруппировано по ETAPI-категориям:**

| Группа | Инструмент | ETAPI | Назначение |
|---|---|---|---|
| **Контент** | `get_note_content` | `GET /notes/{id}/content` | Сырой HTML/text тела заметки |
| **Revisions** | `create_note_revision` | `POST /notes/{id}/revision` | Снапшот текущего состояния |
| | `list_note_revisions` | `GET /notes/{id}/revisions` | Список ревизий |
| | `get_revision` | `GET /revisions/{id}` | Метаданные ревизии |
| | `get_revision_content` | `GET /revisions/{id}/content` | Контент ревизии |
| **Branches/clone** | `clone_note` | `POST /branches` | Клонировать note к другому родителю (prefix/position) |
| | `get_branch` | `GET /branches/{id}` | branch по ID |
| | `update_branch` | `PATCH /branches/{id}` | prefix/notePosition |
| | `delete_branch` | `DELETE /branches/{id}` | удалить размещение (или note, если последний) |
| | `refresh_note_ordering` | `POST /refresh-note-ordering/{parentId}` | пуш позиций детям |
| **Attachments** | `create_attachment` | `POST /attachments` | Загрузить файл/изображение (base64 в JSON-body) |
| | `get_attachment` | `GET /attachments/{id}` | Метаданные |
| | `list_note_attachments` | `GET /notes/{id}/attachments` | Список вложений |
| | `update_attachment` | `PATCH /attachments/{id}` | title/mime/role/position |
| | `delete_attachment` | `DELETE /attachments/{id}` | удалить |
| | `get_attachment_content` | `GET /attachments/{id}/content` | скачать байты |
| | `set_attachment_content` | `PUT /attachments/{id}/content` | заменить байты |
| **Attributes (доп)** | `get_attribute` | `GET /attributes/{id}` | один атрибут по ID |
| | `update_attribute` | `PATCH /attributes/{id}` | value/position |
| **Export/Import** | `export_note_subtree` | `GET /notes/{id}/export` | Экспорт subtree ZIP (html/markdown/share; `root` — весь doc) |
| | `import_note_zip` | `POST /notes/{id}/import` | Импорт ZIP в note |
| **History/undelete** | `undelete_note` | `POST /notes/{id}/undelete` | Восстановить удалённую note |
| | `get_recent_changes` | `GET /notes/history` | Недавние create/modify/delete (scope по subtree) |
| **Calendar (доп)** | `get_week_note_by_date` | `GET /calendar/week-first-day/{date}` | Week-note по дате |
| | `get_month_note` | `GET /calendar/months/{month}` | Month-note (YYYY-MM) |
| | `get_year_note` | `GET /calendar/years/{year}` | Year-note (YYYY) |
| **Системные** | `login` | `POST /auth/login` | Пароль → ETAPI-токен |
| | `logout` | `POST /auth/logout` | Отзыв токена |
| | `create_backup` | `PUT /backup/{name}` | Триггер бэкапа БД |
| | `get_metrics` | `GET /metrics` | Метрики инстанса (Prometheus/JSON) |

**Композитные инструменты (поверх ETAPI, добавляются как convenience для wiki-workflow):**

| Инструмент | Назначение |
|---|---|
| `upsert_note` | find-by-title-or-path → create-or-update (антидубликат, ядро ingest) |
| `get_backlinks` | кто ссылается на note (через search по relations + встроенный) — закрывает «backlinks» |
| `find_orphans` | notes без входящих relations в поддереве (ячейка lint) |
| `search_by_attribute` | удобная обёртка: `#status=weak`, `#wikiLayer=concept`, и т.п. |
| `replace_note_section` | секционное редактирование: найти блок (по заголовку/якорю) и заменить/вставить (устраняет read-then-write на всю заметку) |
| `bulk_set_attributes` | проставить label набору notes по запросу |
| `find_related` | **4-signal relevance**: directLink (relations)×3 + sourceOverlap (общие `derivedFrom`)×4 + Adamic-Adar (общие цели relations)×1.5 + typeAffinity (`#wikiType`-матрица)×1 → ранжированный список родственных note-ID (ядро QUERY и graph-expansion) |
| `query_wiki` | retrieval-pipeline в одном инструменте: search → graph expansion (`find_related`, 2-hop decay) → budget-control (60/20/5/15) → assembly с пронумерованными страницами [1][2] для цитирования |
| `deep_research` | v1.5: WebSearch по теме → synthesis research-страница → auto-ingest; search-queries из review-items |
| `resolve_review` | отметить review-item resolved (+ action); review-queue — human-in-the-loop |

Итого: **~46+ инструментов**, полное покрытие ETAPI + wiki-ориентированные композиты.

> Примечание по точности: эндпоинты `GET /metrics` и `GET /calendar/week-first-day/{date}` реализованы, но **отсутствуют в `etapi.openapi.yaml`** — если клиент генерируется из спеки, добавить их вручную.

### 4.3. Качество и инженерия

- **Типизация:** zod-схемы входов каждого инструмента; TS-типы для ETAPI-сущностей (Note, Branch, Attribute, Attachment, Revision).
- **Тесты:** Vitest. Unit — на моках ETAPI; **integration — против живого локального Trilium** (см. секцию 6). Каждый инструмент имеет хотя бы один happy-path integration-тест.
- **Обработка ошибок:** единый маппинг ETAPI `{code}` → человекочитаемое сообщение MCP; таймауты; ретраи на сетевые 5xx.
- **Безопасность:** токен только из env (никогда в коде/логах); sanitize путей для export/import.
- **Линт/формат:** ESLint + Prettier (как в референсе).

### 4.4. Дистрибуция

- Пакет `trilium-llm-wiki-mcp` (npm; `bin` для запуска). Запуск: `npx -y trilium-llm-wiki-mcp` или локально.
- Пример регистрации в Claude Code (user-scope):
  ```bash
  claude mcp add --scope user trilium \
    --env TRILIUM_URL=http://localhost:8080 \
    --env TRILIUM_TOKEN=<etapi-token> \
    -- node dist/index.js
  ```
- `.mcp.json`-пример в репо для project-scope.
- **Companion CLI** `trilium-wiki` (см. 5.4) — для хуков, отдельный `bin`; ходит в ETAPI через **тот же общий ETAPI-клиент-модуль**, что и MCP (минуя только MCP-транспорт, т.к. он недоступен в моменты срабатывания хуков). Команды: `init`, `brief`, `checkpoint`, `seed`.

### 4.5. Портабельность и install на любой ПК (multi-PC reuse)

Требование: связка MCP + skill + hooks + локальный Trilium должна ставиться **одной командой на любой машине** и работать повторно (в т.ч. на других ПК пользователя). Принципы:

- **Всё через env, никаких ПК-специфичных путей в committed-файлах.** Только `TRILIUM_URL`, `TRILIUM_TOKEN` (опц. `TRILIUM_VERIFY_TLS`). `.mcp.json`, скилл и блок hooks используют `npx`/`~`, не абсолютные пути вида `D:\...`.
- **Каноничный install через npm:** MCP и companion-CLI — один пакет `trilium-llm-wiki-mcp` с двумя `bin` (`trilium-mcp` для MCP-сервера, `trilium-wiki` для CLI/хуков). Запуск без глобальной установки: `npx -y trilium-llm-wiki-mcp`.
- **Единый bootstrap** `trilium-wiki install` (или `install.sh` / `install.ps1`) — за один шаг:
  1. регистрирует MCP в Claude Code (`claude mcp add ... -- npx -y trilium-llm-wiki-mcp`) с env из `~/.trilium-wiki.env` или переменных окружения;
  2. копирует/симлинкает скилл в `~/.claude/skills/<name>/`;
  3. прописывает блок hooks (SessionStart → `trilium-wiki brief`, Stop → `trilium-wiki checkpoint`) в `~/.claude/settings.json` (merge, не перетирая существующее);
  4. проверяет связку: `trilium-wiki doctor` (доступен ли Trilium по `TRILIUM_URL`, валиден ли токен через `get_app_info`, найден ли vault; иначе предлагает `init`).
- **Idempotent seed:** `trilium-wiki init [--template general|research|...]` создаёт vault `LLM Wiki` в подключённом Trilium (корень + Purpose/Raw/Wiki/.../Index/Log + label/relation-конвенции), если его ещё нет; на уже инициализированном — no-op. → любой новый ПК после `install`+`init` сразу работоспособен.
- **Dotfiles-friendly:** `~/.trilium-wiki.env`, скилл и блок hooks можно хранить в своём config-репо и накатывать `trilium-wiki install` на каждой машине. Данные wiki живут в Trilium (синхронизируются — §6.1), а не в локальных файлах.
- **Кросс-платформа:** bash-команды для macOS/Linux/Windows (Git Bash); Windows-специфика (`curl.exe` вместо алиаса, `%VAR%`/`$env:`, %-кодирование двоеточия в путях) учтена в CLI и документации.

---

## 5. Артефакт 2 — LLM-wiki Skill + хуки

### 5.1. Структура vault'а в Trilium (LLM Wiki)

Один корень — note **`LLM Wiki`** (создаётся seed-скриптом при инициализации). Поддеревья:

```
LLM Wiki/
├── Purpose                  # «зачем wiki» (goal/key questions/scope/thesis) — читается на каждом ingest+query
├── Raw/                     # неизменяемые источники
│   └── <одна note на источник>
├── Wiki/
│   ├── Summaries/           # одна страница на ingested-источник
│   ├── Concepts/            # кросс-источниковый синтез
│   ├── Entities/            # люди/орги/места/продукты/события
│   ├── Queries/             # открытые вопросы под исследованием (+ contradiction-tracking)
│   ├── Comparisons/         # side-by-side анализ сущностей
│   ├── Overview/            # эволюционирующий обзор/тезис (auto-update на каждом ingest)
│   └── Synthesis/           # ответы/анализ, filed из query
├── Review/                  # async review-queue (human-in-the-loop): contradiction/duplicate/missing-page/confirm/suggestion
├── Index                    # контентный каталог (одна строка/страница)
└── Log                      # append-only хронология (≡ log.md)
```

- **Purpose** — directional intent (schema = правила *как*, purpose = *зачем*); SKILL читает её на каждом ingest и query.
- **Index** — обновляется при каждом ingest/query; агент читает его первым («карта»).
- **Log** — `append_to_note`, формат `## [YYYY-MM-DD] ingest|query|lint|delete | Title`. Парсится и агентом, и companion-CLI.
- **Review/** — каждый item = note с `#reviewType`, predefined actions, pre-generated search queries (для Deep Research).

### 5.2. Конвенции labels и relations

**Labels (≡ frontmatter, queryable):**
- `#wikiLayer = raw | summary | concept | entity | query | comparison | overview | synthesis | review | index | log`
- `#wikiType = ` page-type enum: `entity | concept | source | query | comparison | synthesis | overview` + доменные (для entity — `person|org|place|product|event`; для raw — `article|paper|video|transcript|...`; scenario-зависимые — `thesis|decision|goal|...`). `#wikiType` удваивается как сигнал type-affinity в relevance-модели и как coloring в графе.
- `#status = weak | moderate | strong` (confidence; есть → знать, что перепроверить при новом источнике)
- `#updated = YYYY-MM-DD` (staleness для lint)
- `#sources = N` (число источников, обосновывающих страницу; совпадает с числом `derivedFrom`)
- `#ingested = YYYY-MM-DD` (для raw)
- `#contentHash = <sha256>` (на raw-note; инкрементальный cache — skip re-ingest если совпал)
- `#reviewType = contradiction | duplicate | missing-page | confirm | suggestion` (на note в `Review/`); `#reviewResolved = true|false`; `#reviewAction = create-page | deep-research | skip`
- `#orphanCandidate = true` (ставится lint'ом; дополнительно к review-queue)

Наследуемые labels (`isInheritable`) — где уместно (напр. `#wikiLayer` на корне поддерева).

**Relations (≡ типизированный граф, строго лучше `[[wikilinks]]`):**
- `derivedFrom` — summary/synthesis → raw-источник (хребет цитирования и source-overlap-сигнал)
- `relatesTo` — общая семантическая связь (directLink-сигнал)
- `supersedes` — новое утверждение → устаревшее, которое оно заменяет
- `contradicts` — страница A → страница B, противоречащая ей («ledger противоречий»)
- `mentions` / `about` — обратные ссылки на сущности
- `partOf` — сущность → группирующий концепт

> Все «signals» relevance-модели вычисляются из этого типизированного графа, а не из сканирования frontmatter по всему vault (в отличие от markdown-`[[wikilinks]]`).

### 5.3. `SKILL.md` = schema (рабочие процессы ingest/query/lint)

Скилл лежит в репо и устанавливается в Claude Code. Его `SKILL.md` кодирует три процесса как инструкции, вызывающие инструменты MCP.

**Trigger discipline (frontmatter SKILL):** скилл срабатывает ТОЛЬКО когда пользователь явно говорит «my wiki / LLM Wiki / wiki / база знаний». **НЕ** срабатывает на «search my notes / check my Obsidian / Notion» и т.п. — у тех свои инструменты. **В сомнении — спроси**, не вызывай API вслепую.

**INGEST** (один источник → ~10–15 страниц) — **two-step Chain-of-Thought**:
- *Pre-check:* если raw-note с таким `#contentHash` уже есть И все её derived-страницы на месте → **skip** (инкрементальный cache).
- **Шаг 1 — Analysis** (отдельный проход LLM): прочитать источник + `Purpose` + `Index`; выделить ключевые entities/concepts/arguments, связи с существующим wiki, **противоречия** с уже известным, рекомендации по структуре.
- **Шаг 2 — Generation** (из анализа): создать/обновить raw-note (`#wikiLayer=raw #contentHash #ingested #wikiType`); создать summary (`#wikiLayer=summary #status #sources=1 #updated`, `derivedFrom→raw`); для каждого entity/concept — **сначала поиск** (`upsert_note`/`search_by_attribute`) → создать **или обновить** (merge, без дублей; правки через `replace_note_section`); проставить relations; **регенерировать `Overview`**; обновить `Index`; дописать `## [date] ingest | Title` в `Log`; создать **review-items** (contradiction/missing-page/confirm/suggestion с predefined actions и pre-generated search queries).
- *Contradiction protocol:* обнаружено противоречие → note в concept/entity → создать/обновить `query`-страницу → `contradicts`/`supersedes` relations на оба источника → resolve позже в synthesis.
- **Hard rules:** всегда искать перед созданием (антидубли); каждое утверждение цитирует raw через `derivedFrom`; Index + Log + Overview обновляются в той же проходке; `#status` обязателен на контентных страницах.

**QUERY** (вопрос → синтез → filed) — **retrieval pipeline**:
1. Прочитать `Purpose` + `Index` (карта).
2. `query_wiki` (или вручную): search (`search_by_attribute`/`search_notes`) → **graph expansion** через `find_related` (2-hop decay) → **budget control** (пропорционально ~60% wiki / 20% history / 5% index / 15% system) → assembly с **пронумерованными страницами**.
3. Прочитать контент только отобранных страниц (`get_note_content`).
4. Синтезировать ответ с цитатами по номерам **[1][2]** (→ note-ID/path).
5. Если ответ ценен — filed как synthesis-страница (`#wikiLayer=synthesis`, `derivedFrom` → использованные страницы), обновить `Index` + `Log` (`## [date] query | question`).

**LINT** (health-check, по требованию или периодически) → пишет в **Review/** (async human-in-the-loop, не блокирует):
1. **Schema integrity:** страницы без обязательных labels (`#status`/`#updated`/`#sources`).
2. **Staleness:** по `#updated` asc топ-5–10 старейших; superseded ли новыми.
3. **Coverage gaps:** упоминания без своей страницы → review-item `missing-page` (+ pre-generated search query).
4. **Overview drift:** `#updated` Overview vs новейшая summary.
5. **Orphan check:** `find_orphans`/`get_backlinks`; ноль входящих → `#orphanCandidate=true` + review-item.
6. **Duplicate detection:** near-identical titles → review-item `duplicate`.
7. **Contradictions:** пройти по `contradicts`/`supersedes` → вывести неразрешённые.
8. *(v1.5) Graph lint:* Louvain communities + cohesion; sparse communities (<0.15), bridge nodes, isolated pages, surprising connections.
- **Вывод:** Lint-report note + review-items в `Review/` + `## [date] lint | summary` в `Log`.
- **Hard rules:** **никогда не удалять в одиночку** (флаг на approval через review); **не создавать контентные страницы** (это работа ingest); чинить metadata только когда значение однозначно; всегда логировать проход.

**DELETE** (cascade cleanup, по явной команде):
- Удалить raw-note → найти все derived (через `derivedFrom`) summary/synthesis и удалить; у shared entity/concept только убрать источник из `#sources` (не удалять страницу); вычистить `Index` и мёртвые relations; `## [date] delete | Title` в `Log`. Подтверждение пользователя обязательно.

**DEEP_RESEARCH** (v1.5, ingest-path): review-item с action `deep-research` (или явный запрос) → WebSearch по pre-generated queries → synthesis research-страница с cross-refs → auto-ingest (шаги 1–2 INGEST).

> В `SKILL.md` также зафиксировать: эвристику «новая страница vs правка» (новая = отдельная сущность/концепция, на которую сошлёшься; правка = атрибут/обновление существующей), правило «map not bodies», обязательность `#status`, и что **drift — главный враг** (lint обязателен).

### 5.4. Хуки автоматизации

Хукам нужен доступ к wiki в моменты, когда MCP-сервер ещё/уже не активен — поэтому хуки дёргают **companion CLI** `trilium-wiki` (ходит в ETAPI напрямую, env `TRILIUM_URL`/`TRILIUM_TOKEN`), а не MCP.

- **SessionStart** → `trilium-wiki brief`:
  - Читает `Index` (compact-сводку), последние 5 записей `Log`, счётчики `#status=weak` и `#orphanCandidate=true`, открытые вопросы.
  - Выводит wiki-бриф, который инжектится как контекст сессии → каждая сессия стартует осведомлённой о состоянии wiki.
- **Stop** → `trilium-wiki checkpoint`:
  - Дописывает в `Log` session-end маркер и сводку затронутых страниц (если выводимо), подсвечивает счётчики weak/orphan.
  - **Не пишет контент wiki автоматически** (review-gate удерживается скиллом); лишь напоминает агенту filed ценные synthesis-результаты, если они есть.
- **(опц.) Periodic lint** — отдельный slash-command/расписание (через CronCreate или ручной `/lint`), вызывает lint-pass из скилла.

Конфиг хуков — через `settings.json` (SessionStart / Stop), устанавливаются update-config-скиллом или вручную. В репо — готовый пример блока hooks.

### 5.5. Принцип «map not bodies» (критично)

Агент **никогда** не читает тела всех страниц ради поиска. Маршрут всегда:
`Index note` → `search_by_attribute`/`search_notes` (узкий фильтр по labels) → выбрать ~10 note-ID → `get_note_content` только этих.

---

## 6. Локальный Trilium + тестирование

### 6.1. Поднятие TriliumNext

- `docker-compose.yml` в репо: образ `triliumnext/notes`, persistent volume (`./trilium-data`), порт `8080:8080`, env при необходимости.
- Запуск: `docker compose up -d`. Healthcheck на `GET /etapi/app-info`.
- **ETAPI-токен** для тестов: через `POST /etapi/auth/login` (`{password}`) — завести детерминированный тестовый пароль/токен; либо UI Options → ETAPI. Токен класть в `.env` (в `.gitignore`).
- **Multi-PC (одна wiki на всех машинах пользователя):** на каждом ПК — свой локальный TriliumNext (тот же `docker-compose.yml`, `TRILIUM_URL=http://localhost:8080`), MCP каждой машины указывает на свой `localhost`. Единое состояние — через **Trilium sync**: один инстанс назначается sync-server (или поднимается отдельный sync-server на всегда-доступной машине в LAN), остальные настраивают sync к нему (UI *Sync → Server hostname*, или env sync-server). Изменения реплицируются между всеми ПК; каждый работает локально и offline-capable. Альтернатива — **центральный сервер** (один общий Trilium на домашнем сервере/VPS/tunnel, все ПК ставят `TRILIUM_URL` на него без локального инстанса) — проще, но требует онлайн-доступности.
- Для тестов/CI — изолированный ephemeral-инстанс (отдельный volume) с фиксированным токеном; sync на время тестов отключён.

### 6.2. Тесты

- **Unit (Vitest):** ETAPI-клиент и инструменты на моках.
- **Integration (Vitest):** каждый MCP-инструмент — happy-path против живого Trilium; setup-фикстура создаёт тестовое поддерево, teardown — удаляет.
- **E2E методологии:** см. 6.3 — главный приёмочный тест.

### 6.3. End-to-end проверка методологии (acceptance)

Сквозной тест, доказывающий, что методология Карпатого работает поверх Trilium:
1. **Ingest (two-step CoT):** взять короткий демо-источник → запустить ingest → **assert:** raw-note с `#contentHash` + summary + N entity/concept-страниц (≥10 затронутых), `derivedFrom` проставлены, `Overview` регенерирован, `Index` обновлён, `Log` содержит `## [date] ingest | ...`; повторный ingest того же источника **skip** по хешу.
2. **Query (retrieval pipeline):** вопрос по wiki → **assert:** агент читает Index → `query_wiki`/`find_related` отбирает страницы → синтез с [1][2]-цитатами; ценный ответ filed как synthesis с `derivedFrom`; `Log` содержит query-запись.
3. **Lint → Review queue:** запустить lint → **assert:** lint-report + review-items в `Review/`; **намеренное противоречие** (`contradicts`) → review-item `contradiction`; **намеренный orphan** → `#orphanCandidate` + review-item; stale-страница подсвечивается.
4. **Delete (cascade):** удалить raw → derived summary удалён, shared entity сохранён (убран источник из `#sources`), Index/relations вычищены.
5. **SessionStart brief:** `trilium-wiki brief` возвращает осмысленный бриф (Purpose/Index/Log/флаги/нерешённые review).

Критерий приёмки: все 5 шагов зелёные против живого локального Trilium.

---

## 7. Пофазный план выполнения

> Каждая фаза самодостаточна, с явным Definition of Done. Фазы 2 и 4 можно распараллеливать (workflow/суб-агенты).

**Phase 0 — Scaffold + Trilium.**
- Инициализация npm/TS-проекта, линтеры, Vitest.
- `docker-compose.yml`, поднять TriliumNext, получить ETAPI-токен, проверить `app-info`.
- *DoD:* `docker compose up -d` → Trilium доступен; токен в `.env`; `npm test` (пустой) зелёный.

**Phase 1 — Интегрировать референс.**
- Перенести исходники `trilium-notes-mcp` в репо (как basis, с атрибуцией/license), собрать, запустить как MCP, проверить 18 инструментов против живого Trilium.
- *DoD:* референс-инструменты работают; integration-тесты на них зелёные.

**Phase 2 — Расширить MCP (секция 4.2).**
- ETAPI-клиент + новые ~28 инструментов + композитные; integration-тест на каждый.
- *DoD:* все инструменты покрыты тестами против живого Trilium; ESLint/Prettier чисто.

**Phase 3 — Wiki-schema в Trilium + companion-CLI.**
- Companion-CLI `trilium-wiki` (на общем ETAPI-клиенте): `init` (idempotent seed vault'а `LLM Wiki` + Purpose/Raw/Wiki/.../Index/Log + label/relation-конвенции), `brief`, `checkpoint`, `install` (регистрация MCP + скилл + hooks), `doctor` (проверка связки).
- *DoD:* `init` создаёт структуру (повторный — no-op); `brief`/`checkpoint` работают; `install` ставит MCP+skill+hooks на чистой машине по env.

**Phase 4 — Skill (`SKILL.md`).**
- Написать `SKILL.md` с ingest/query/lint + hard rules; инструкции вызывают MCP-инструменты; тесты workflow на демо-данных.
- *DoD:* ingest демо-источника даёт ~10–15 страниц с корректными labels/relations, Index+Log обновлены.

**Phase 5 — Хуки.**
- SessionStart (`brief`) и Stop (`checkpoint`); блок hooks в `settings.json`; документация установки.
- *DoD:* хуки срабатывают в реальной сессии Claude Code против локального Trilium; бриф инжектится.

**Phase 6 — E2E методологии (6.3).**
- Приёмочный тест ingest→query→lint→drift; итерации до зелёного.
- *DoD:* все 4 шага зелёные.

**Phase 7 — Документация, упаковка, multi-PC.**
- README: quickstart в одну команду (`install` + `init`), multi-PC через Trilium-sync (§6.1), регистрация MCP, установка скилла, hooks, Trilium-setup; `.mcp.json`-пример (env-driven, без абсолютных путей); публикация npm-пакета.
- *DoD:* на свежей машине с поднятым Trilium `trilium-wiki install && trilium-wiki init` даёт рабочую связку; тот же wiki виден на втором ПК через sync.

---

## 8. Constraints, non-goals, Definition of Done

**Constraints:**
- Windows 11 + Git Bash (POSIX-синтаксис shell); Node ≥ 18. Кросс-платформа: те же артефакты работают и на macOS/Linux (см. §4.5).
- Следовать стилю кода референса; соблюдать лицензию референса при расширении.
- Токен — только из env; никогда в коде/логах/коммитах. Никаких ПК-специфичных путей в committed-файлах.
- **Лицензия:** проект лицензируем **MIT или Apache-2.0** (база `trilium-notes-mcp` — MIT). Все паттерны реализуем своим кодом; сторонний GPL/copyleft-source не vendorm. См. §3.4.

**Trilium как intrinsic (подтверждено):** пользователь использует связку на нескольких своих ПК с локальным Trilium на каждом → Trilium не placeholder, а целевой backend. Поэтому **multi-PC переиспользование и Trilium-sync закладываем в дизайн** (см. §4.5 и §6.1) как требование первого класса, а не дополнение.

**Non-goals (v1):**
- **Protected notes** (ETAPI требует session-password) — явно отметить как ограничение.
- Семантический/embedding-поиск — использовать встроенный поиск Trilium + 4-signal graph relevance; embeddings как опция (v2).
- Louvain/graph-insights/surprising-connections, Deep Research, scenario-templates — **v1.5** (см. §3.4).
- Командный/multi-user sync, мобильные клиенты, десктоп-GUI — non-goal (это не desktop-app; Claude Code — актор). Персональный multi-PC через Trilium-sync — **цель**, см. §6.1.

**Definition of Done (проект):**
1. Пакет `trilium-llm-wiki-mcp` собирается, все инструменты (секция 4.2) покрыты integration-тестами против живого Trilium, тесты зелёные.
2. Скилл + хуки установлены и работают в реальной сессии Claude Code против локального Trilium.
3. E2E-тест методологии (6.3) зелёный: ingest(two-step+cache)→query(pipeline)→lint(review-queue)→delete(cascade).
4. README позволяет поднять систему с нуля; `.mcp.json`, блок hooks, лицензия + атрибуция в комплекте.
5. Кодовая база типобезопасна, отлинчена, коммиты атомарны.

---

*Дата спецификации: 2026-07-12. Основано на `trilium-notes-mcp` v0.4.3 (MIT), гисте Karpathy `llm-wiki` (442a6bf...), полном перечне ETAPI TriliumNext (42 эндпоинта, источник: `apps/server/src/assets/etapi.openapi.yaml` + route-implementations). Версия спецификации: 1.2 (переиспользуемость/multi-PC install, clean-room реализация без стороннего кода; two-step CoT, 4-signal relevance, review-queue, cascade-delete, shared ETAPI-client).*
