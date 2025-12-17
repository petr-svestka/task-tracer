# Task Tracker (Docker)

## Požadavky

- Docker
- Docker Compose
- Git

## Nasazení

```bash
git clone https://github.com/petr-svestka/task-tracer.git
cd task-tracker
docker-compose up --build -d
```

## Přístup

- Frontend: http://localhost:3000
- RedisInsight (ladění): http://localhost:8001

## Testování

### 1) Seed – 10 testovacích úkolů
Spusťte seed skript, který vloží 10 úkolů do Redis.

TODO : vytvorit seed script

> Pozn.: Upravte níže uvedený příkaz podle toho, jak je seed v projektu řešen (např. `docker-compose exec <service> ...`).

```bash
# PŘÍKLAD (upravte dle projektu):
# docker-compose exec <backend-service> npm run seed
# nebo:
# docker-compose exec <backend-service> python -m app.seed
```

Očekávání:

TODO : co ten skript dela

- Po spuštění se ve UI objeví 10 nových úkolů.


## Ukončení

Zastavení a smazání dat (včetně volumes):

```bash
docker-compose down -v
```

## Dokumentace

### Screenshoty
Doplňte screenshoty do repozitáře a odkažte je zde:

TODO : pridat screenshoty

- `docs/screenshots/01-dashboard.png` – přehled úkolů
- `docs/screenshots/02-create-task.png` – vytvoření úkolu
- `docs/screenshots/03-realtime.png` – real-time aktualizace (2 okna)

> Upravte názvy/cesty podle skutečného umístění souborů.

### Diagram architektury (draw.io)
Vytvořte architektonický diagram v draw.io a uložte jej do repozitáře, např.:

- `docs/architecture.drawio` (zdroj)
- `docs/architecture.png` (export pro README)

TODO : diagram

Doporučený obsah diagramu:
- Frontend (React/Vite)
- Backend služba (pokud existuje)
- Redis + RedisInsight
- Komunikace (HTTP/WebSocket/SSE – dle implementace)
- Docker Compose jako runtime

A vložte náhled:

```text
docs/architecture.png
```

(Do README následně přidejte standardní markdown obrázek, až budou soubory existovat.)
