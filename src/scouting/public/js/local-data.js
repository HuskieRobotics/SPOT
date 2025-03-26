/* LOCAL DATABASE */
class LocalData {
  static db;
  static objectStore;
  static dbName;

  static initialize(dbName) {
    // window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
    window.IDBTransaction = window.IDBTransaction ||
      window.webkitIDBTransaction ||
      window.msIDBTransaction || { READ_WRITE: "readwrite" }; // This line should only be needed if it is needed to support the object's constants for older browsers
    window.IDBKeyRange =
      window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;

    LocalData.dbName = dbName;
    const request = window.indexedDB.open(LocalData.dbName, 1);

    request.onerror = function (event) {
      console.error("IndexedDB failed to open");
    };

    request.onsuccess = function (event) {
      LocalData.db = event.target.result;
      LocalData.db.onerror = function (event) {
        console.error("IndexedDB error: " + event.target.errorCode);
      };
    };

    request.onupgradeneeded = function (event) {
      LocalData.db = event.target.result;
      let objectStore;
      if (!LocalData.db.objectStoreNames.contains(LocalData.dbName)) {
        objectStore = LocalData.db.createObjectStore(LocalData.dbName, {
          keyPath: "matchId",
        });
        // objectStore.createIndex('teamMatchPerformance', 'teamMatchPerformance', { unique: false });
      } else {
        objectStore = LocalData.db
          .transaction(LocalData.dbName, "readwrite")
          .objectStore(LocalData.dbName);
      }
    };
  }

  static async getAllTeamMatchPerformances() {
    return await new Promise(async (resolve) => {
      let objectStore = LocalData.db
        .transaction(LocalData.dbName, "readwrite")
        .objectStore(LocalData.dbName);
      const request = await objectStore.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };
    });
  }

  static async storeTeamMatchPerformance(teamMatchPerformance) {
    //Sync with local
    const storedMatchIds = (await LocalData.getAllTeamMatchPerformances()).map(
      (teamMatchPerformance) => teamMatchPerformance.matchId
    );
    let objectStore = LocalData.db
      .transaction(LocalData.dbName, "readwrite")
      .objectStore(LocalData.dbName);

    if (!storedMatchIds.includes(teamMatchPerformance.matchId)) {
      await new Promise((resolve) => {
        let addRequest = objectStore.add(teamMatchPerformance);

        addRequest.onsuccess = () => {
          resolve();
        };

        addRequest.onerror = function (event) {
          console.log("IndexedDB Error:", addRequest.error.name);
          resolve();
        };
      });
    }
  }

  static async clearTeamMatchPerformances() {
    const objectStore = LocalData.db
      .transaction(LocalData.dbName, "readwrite")
      .objectStore(LocalData.dbName);
    const request = await objectStore.clear();
  }
}

LocalData.initialize("development2");
