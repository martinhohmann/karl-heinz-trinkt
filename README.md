# Karl-Heinz trinkt

Einfache Trink-App: per Knopfdruck eintragen, wie viel getrunken wurde. Ein großes Glas zeigt, wie viel bis zum Tagesziel (2.000 ml) noch fehlt.

- **App:** https://martinhohmann.github.io/karl-heinz-trinkt/
- **Datenbank:** Firebase-Projekt „Trink-App“ (`trink-app-81c66`), Cloud Firestore in Frankfurt
- **Anmeldung:** ein gemeinsamer Familien-Code, einmal pro Gerät
- **Erinnerungen:** GitHub Actions prüft um 10, 12, 14, 16 und 18 Uhr; bei mehr als 200 ml Rückstand geht eine Mitteilung an alle Geräte mit eingeschalteten Erinnerungen

Dieses Repository ist öffentlich. Hier stehen keine Geheimnisse und keine Trinkdaten.

## Dateien
| Datei | Zweck |
|---|---|
| `index.html`, `app.js` | die App |
| `config.js` | Tagesziel, Glasgrößen, Firebase-Projekt |
| `sw.js` | Mitteilungen anzeigen, Start bei schlechtem Netz |
| `firestore.rules` | Vorlage der Datenbankregeln (gültig ist der Stand in der Firebase-Konsole) |
| `tools/erinnerung.mjs`, `.github/workflows/erinnerung.yml` | Erinnerungs-Dienst |

## Erinnerungen einrichten (einmalig)
1. App öffnen → **Verlauf** → **Einrichtung (für Martin)** → „Schlüssel erzeugen“ → „Geheimnis kopieren“.
2. In diesem Repository unter *Settings → Secrets and variables → Actions* ein Secret `PUSH_SECRET` mit dem kopierten Wert anlegen.
3. Auf dem iPad: Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“. App von dort öffnen, anmelden, „Erinnerungen einschalten“.
4. Probe: *Actions → Erinnerung → Run workflow*.

## Ändern
Tagesziel und Glasgrößen stehen in `config.js`; das Tagesziel zusätzlich in `tools/erinnerung.mjs` (`GOAL`).
