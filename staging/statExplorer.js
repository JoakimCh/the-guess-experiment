
import {e, debug, show, hide, disable, enable} from 'wrapped-elements'

export const ui = {}

export const uiContainer = e.div.class('mainContainer')(
  e.h1('The Guess Experiment'),
  e.h2('Stat explorer'),
  e.p('Not implemented yet...'),
  e.p('For now you can download the database and analyze it yourself.'),
  ui.button_export = e.button('Export DB to JSON'),
  ui.button_back = e.button('Back to the experiment')
)

ui.button_export.onclick = () => {
  exportIndexedDBToJSON('stats', 'theGuessExperimentLocalDatabase')
}

function exportIndexedDBToJSON(dbName, exportName = dbName) {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(dbName)
    request.onsuccess = (event) => {
      const db = event.target.result
      const data = {}
      const tx = db.transaction(db.objectStoreNames, "readonly")
      for (const storeName of db.objectStoreNames) {
        const store = tx.objectStore(storeName)
        data[storeName] = []
        const cursorRequest = store.openCursor()
        cursorRequest.onsuccess = (e) => {
          const cursor = e.target.result
          if (cursor) {
            data[storeName].push({
              key: cursor.key,
              value: cursor.value
            })
            cursor.continue()
          }
        }
        cursorRequest.onerror = () => reject(`Cursor error in ${storeName}`)
      }
      tx.oncomplete = () => {
        const json = JSON.stringify(data, null, 2)
        resolve(json)
        const blob = new Blob([json], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${exportName}.json`
        a.click()
      }
      tx.onerror = () => reject("Transaction error")
    }
    request.onerror = () => reject("Database error")
  })
}
