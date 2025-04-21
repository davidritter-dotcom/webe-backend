## WebE Semesterarbeit

#### David Ritter, Enzo Mazotti

### Meilenstein 3 – Was ist dazugekommen?

Das Erstellen einer Lobby sowie das Beitreten zu einer Lobby über eine Lobby-ID, das Verlassen einer Lobby und das Suchen sowie Einladen von Spielern über den Benutzernamen wurden über alle Schichten bis in die Datenbank umgesetzt. Die Lobbys werden in der Datenbank persistiert.

Bereits vorhandene Funktionalitäten wurden etwas aufgeräumt und zusammengeführt, sodass nun ein erster realistischer Ablauf von der Registrierung über den Login bis hin zum Erstellen einer Lobby und dem Starten eines Spiels besteht.

Beim Spiel selbst wurde die Zeichenfunktion weiter optimiert, sodass die gezeichneten Inhalte nun nahtlos über WebSockets übertragen und korrekt dargestellt werden. Die Spiellogik selbst funktioniert jedoch noch nicht.
