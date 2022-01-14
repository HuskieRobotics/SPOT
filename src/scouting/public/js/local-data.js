/* LOCAL DATABASE */
class LocalData {
    static db
    static objectStore
    static dbName

    static initialize(dbName) {
        // window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction || {READ_WRITE: "readwrite"}; // This line should only be needed if it is needed to support the object's constants for older browsers
        window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
        
        LocalData.dbName = dbName
        const request = window.indexedDB.open(LocalData.dbName, 1)

        request.onerror = function(event) {
            console.error("IndexedDB failed to open")
        }

        request.onsuccess = function(event) {
            LocalData.db = event.target.result
            LocalData.db.onerror = function(event) {
                console.error("IndexedDB error: " + event.target.errorCode)
            }
        }

        request.onupgradeneeded = function(event) {
            LocalData.db = event.target.result;
            let objectStore
            if (!LocalData.db.objectStoreNames.contains(LocalData.dbName)) {
                objectStore = LocalData.db.createObjectStore(LocalData.dbName, { keyPath: "matchId" });
                // objectStore.createIndex('matchTeamPerformance', 'matchTeamPerformance', { unique: false });
            } else {
                objectStore = LocalData.db.transaction(LocalData.dbName, 'readwrite').objectStore(LocalData.dbName);
            }
        } 
    }

    static storeMatchTeamPerformance(matchTeamPerformance) {
        let objectStore = LocalData.db.transaction(LocalData.dbName, "readwrite").objectStore(LocalData.dbName)
        console.log(matchTeamPerformance)
        let request = objectStore.add(matchTeamPerformance)

        request.onsuccess = () => {
            console.log("IndexedDB add success")
        }
    }
}

LocalData.initialize("development")