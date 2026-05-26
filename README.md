# NH Training Progress

Mobile-first Web-App aus den Excel-Trainingsplaenen und dem Data Tracker.

## Enthalten

- Dashboard mit Gewichtstrend, Ernaehrung, Schlaf und Schritten
- Trainingsbereich fuer Meso 2 bis 4 mit Sessions und Uebungen
- Live-Workout mit Satz-Logging, RIR und Rest-Timer
- Analyseansicht fuer Wachstum, Recovery, Trainingsvolumen und e1RM
- Tracker mit schnellen Daily Check-ins inklusive Energie, Stress und Verdauung
- Wochenfortschritt je Meso mit erledigten Sessions
- Installierbare PWA fuer das Smartphone

## Lokal starten

Im Ordner `C:\Users\Nico\Documents\Fitnessapp` einen lokalen Webserver starten:

```powershell
python -m http.server 4188
```

Danach im Browser `http://localhost:4188` oeffnen. Neue Eintraege und geloggte Workouts werden lokal im Browser gespeichert; die aus Excel uebernommenen Basisdaten bleiben unveraendert.
