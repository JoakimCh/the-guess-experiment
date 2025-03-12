
/** @type {IDBDatabase} */
let db // the open DB
let sessionId, session
let myTotal, peerTotal, myTotalWithPeer

await init() // connect to database

function init() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('stats', 1)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      setup(request.result)
    }
    request.onsuccess = () => {
      db = request.result
      resolve()
    }
  })
}

/** setup changes in this version (or initial setup) 
 * @param {IDBDatabase} db */
function setup(db) {
  if (!db.objectStoreNames.contains('sessions')) {
    // for sessions between peers
    const store = db.createObjectStore('sessions', {autoIncrement: true})
    store.createIndex('peer', ['peer'], {unique: false})
  }
  if (!db.objectStoreNames.contains('kv')) {
    // for generic key/value storage
    const store = db.createObjectStore('kv')
  }
}

export function newSession({peer, numCards = 5}) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('kv', 'readwrite')
    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = () => {
      session = {
        startTime: Math.trunc(Date.now() / 1000), 
        endTime: null, numCards, peer, 
        myTotal: 0, myCorrect: 0, peerTotal: 0, peerCorrect: 0
      }
      resolve()
    }
    transaction.objectStore('kv').get('myTotal')
    .onsuccess = ({target: {result}}) => {
      myTotal = result || {}
      if (!myTotal[numCards]) {
        myTotal[numCards] = {total: 0, correct: 0}
      }
    }
    transaction.objectStore('kv').get('peerTotal_'+peer)
    .onsuccess = ({target: {result}}) => {
      peerTotal = result || {}
      if (!peerTotal[numCards]) {
        peerTotal[numCards] = {total: 0, correct: 0}
      }
    }
    transaction.objectStore('kv').get('myTotalWithPeer_'+peer)
    .onsuccess = ({target: {result}}) => {
      myTotalWithPeer = result || {}
      if (!myTotalWithPeer[numCards]) {
        myTotalWithPeer[numCards] = {total: 0, correct: 0}
      }
    }
  })
}

export function saveResult({correct, peerGuess}) {
  if (!session) throw Error('No session')
  const {numCards} = session
  session.endTime = Math.trunc(Date.now() / 1000)
  if (peerGuess) {
    session.peerTotal ++
    peerTotal[numCards].total ++
    if (correct) {
      session.peerCorrect ++
      peerTotal[numCards].correct ++
    }
  } else {
    session.myTotal ++
    myTotal[numCards].total ++
    myTotalWithPeer[numCards].total ++
    if (correct) {
      session.myCorrect ++
      myTotal[numCards].correct ++
      myTotalWithPeer[numCards].correct ++
    }
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['sessions', 'kv'], 'readwrite')
    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = resolve
    transaction.objectStore('sessions')
    .put(session, sessionId)
    .onsuccess = ({target: {result}}) => {
      sessionId = result
    }
    const kvStore = transaction.objectStore('kv')
    if (peerGuess) {
      kvStore.put(peerTotal, 'peerTotal_'+session.peer)
    } else {
      kvStore.put(myTotal, 'myTotal')
      kvStore.put(myTotalWithPeer, 'myTotalWithPeer_'+session.peer)
    }
  })
}

export function getSessionsWith(peer) {
  const transaction = db.transaction('sessions', 'readonly')
  const index = transaction.objectStore('sessions').index('peer')
  return new Promise((resolve, reject) => {
    const request = index.getAll([peer])
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Get the score related to the session, also the total score from stored results. */
export function getScore() {
  return {session, myTotal, peerTotal, myTotalWithPeer}
}

// await newSession({peer: 'bob', numCards: 5})
// await saveResult({correct: true, peerGuess: true})
// await saveResult({correct: true, peerGuess: true})
// await saveResult({correct: true, peerGuess: false})
// console.log(await getSessionsWith('bob'))
