// Öffentliche Einstellungen der App. Hier stehen keine Geheimnisse:
// Der Firebase-Web-Schlüssel ist öffentlich, geschützt wird über Anmeldung + Datenbankregeln.
export const CONFIG = {
  firebase: {
    apiKey: "AIzaSyDeYrEsbbJdb-GQTji6NehHAD2dqxOf8jw",
    authDomain: "trink-app-81c66.firebaseapp.com",
    projectId: "trink-app-81c66",
    storageBucket: "trink-app-81c66.firebasestorage.app",
    messagingSenderId: "860276170720",
    appId: "1:860276170720:web:ec9d2a51d13b7d5cbb5585"
  },
  // Ein gemeinsames Konto für die Familie; in der App wird nur der Code (= Passwort) abgefragt.
  familyEmail: "karl-heinz-trinkt@example.com",
  goalMl: 2000,          // Tagesziel
  dayStartHour: 8,       // ab hier zählt der "Soll-Verlauf"
  dayEndHour: 20,        // bis hier soll das Ziel erreicht sein
  toleranceMl: 200,      // so viel Rückstand ist in Ordnung, bevor erinnert wird
  sizes: [
    { ml: 100, label: "Kleine Menge" },
    { ml: 150, label: "Kleines Glas" },
    { ml: 200, label: "Mittleres Glas" },
    { ml: 300, label: "Großes Glas" }
  ]
};
