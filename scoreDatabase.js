
export class ScoreDB {
  constructor() {
      if (!ScoreDB.instance) {
          this.db = null;
          ScoreDB.instance = this;
      }
      return ScoreDB.instance;
  }

  async openDatabase() {
      if (this.db) return this.db; // Return existing connection

      return new Promise((resolve, reject) => {
          const request = indexedDB.open("GameResultsDB", 1);

          request.onupgradeneeded = (event) => {
              const db = event.target.result;
              if (!db.objectStoreNames.contains("games")) {
                  const store = db.createObjectStore("games", { keyPath: "id", autoIncrement: true });
                  store.createIndex("players", ["player1", "player2"], { unique: false });
              }
          };

          request.onsuccess = (event) => {
              this.db = event.target.result;
              resolve(this.db);
          };

          request.onerror = () => reject(request.error);
      });
  }

  async saveGame(player1, player2, side, scored, date) {
      const db = await this.openDatabase();
      const transaction = db.transaction("games", "readwrite");
      const store = transaction.objectStore("games");

      return new Promise((resolve, reject) => {
          const request = store.add({ player1, player2, side, scored, date });
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
      });
  }

  async getGamesBetween(player1, player2) {
      const db = await this.openDatabase();
      const transaction = db.transaction("games", "readonly");
      const store = transaction.objectStore("games");
      const index = store.index("players");

      return new Promise((resolve, reject) => {
          const request = index.getAll([player1, player2]);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
      });
  }

  async exportGamesToCSV(player1, player2) {
      const games = await this.getGamesBetween(player1, player2);

      if (games.length === 0) {
          console.log("No data to export.");
          return;
      }

      const csvContent = [
          "Player1,Player2,Side,Scored,Date",
          ...games.map(g => `${g.player1},${g.player2},${g.side},${g.scored},${g.date}`)
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `games_${player1}_${player2}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  }
}

// Usage Example:
// const scoreDB = new ScoreDB();
// scoreDB.saveGame("Alice", "Bob", "left", true, new Date().toISOString());
// scoreDB.exportGamesToCSV("Alice", "Bob");
