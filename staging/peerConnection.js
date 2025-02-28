
import {RTCPerfectNegotiator} from 'rtc-perfect-negotiator'
import {PeerServerSignalingClient, peerjsIceConfig, ensureClientReady} from 'tiny-peerserver-client'
import {e, debug, unwrap, css} from 'wrapped-elements'
// PeerServerSignalingClient.debug = debug

// some shared shit
export let isDominant = true, myId, peerId
let rpcBridge
export function setRpcBridge(value) {
  rpcBridge = value
}

/** @type {PeerServerSignalingClient} */
let signalingClient
/** @type {RTCPeerConnection} */
let peerConnection
/** @type {RTCDataChannel} */
let dataChannel
const idSuffix = '-guessExp'
const ui = {} // our private tags

const styles = [
  ...document.adoptedStyleSheets,
  css.fromString(
    `#button_ready {
      /* color: red; */
    }`, false)
]

// We don't really need to use a shadow DOM here, but it allows us to avoid any ID collisions between HTML-elements declared elsewhere, hence it's a good habit!
export const uiContainer = e.div.id('ui_peerConnection').attachShadow({mode: 'open'}).shadowAdoptStyles(styles).shadowAdd(
  e.div.tag('idContainer', ui).class('horizontal')(
    e.label('My ID:',
      e.input.tagAndId('input_myId', ui)
      .type('text').value(sessionStorage.getItem('myId') || localStorage.getItem('myId'))
      .autocapitalize('none')
    ),
    e.label('Peer ID:', 
      e.input.tagAndId('input_peerId', ui)
      .type('text').value(sessionStorage.getItem('peerId') || localStorage.getItem('peerId'))
      .autocapitalize('none')
    )
  ),
  e.div.class('horizontal')(
    e.button.tag('button_ready', ui)('Ready for peer connection'),
    e.button.tag('button_abort', ui).hidden(true)('Abort peer connection'),
    e.button.tag('button_connect', ui).hidden(true)('Try to connect'),
    e.span.tag('text_connection', ui).class('offline')('Offline'),
  )
)

ui.button_ready.onclick = () => {
  myId = ui.input_myId.value
  peerId = ui.input_peerId.value
  if (!myId || !peerId) {
    alert('Please fill out "my ID" and "peer ID"!')
    return
  }
  sessionStorage.setItem('myId', myId)
  sessionStorage.setItem('peerId', peerId)
  localStorage.setItem('myId', myId)
  localStorage.setItem('peerId', peerId)
  ui.idContainer.setAttribute('disabled','')
  ui.button_ready.hidden = true
  ui.button_abort.hidden = false
  initPeerConnection(myId, peerId, idSuffix)
}

ui.button_abort.onclick = () => {
  resetConnection()
}

ui.button_connect.onclick = () => {
  ui.button_connect.hidden = true
  dataChannel = peerConnection.createDataChannel('protocol1')
  onDataChannel({channel: dataChannel})
}

function resetConnection() {
  rpcBridge.isOpen = false
  peerConnection?.close()
  signalingClient?.close()
  ui.text_connection.className = 'offline'
  ui.text_connection.textContent = 'Offline'
  ui.button_connect.hidden = true
  ui.button_abort.hidden = true
  ui.idContainer.removeAttribute('disabled')
  ui.button_ready.hidden = false
  ui.idContainer.hidden = false
}

async function initPeerConnection(myId, peerId, suffix) {
  myId += suffix; peerId += suffix
  try {
    signalingClient = await ensureClientReady({myId, signalingClient})
  } catch (error) {
    ui.button_abort.click()
    return alert(error)
  }
  const signalingChannel = signalingClient.getChannel(peerId)
  const negotiator = new RTCPerfectNegotiator({
    peerConfiguration: peerjsIceConfig,
    signalingChannel
  })
  peerConnection = negotiator.peerConnection
  ui.button_connect.hidden = false
  initPeerConnectionEvents(peerConnection)
  isDominant = myId > peerId
  // (negotiation is not done before a channel or track is added)
}

/**
 * @param {RTCPeerConnection} peerConnection 
 */
function initPeerConnectionEvents(peerConnection) {
  peerConnection.ondatachannel = onDataChannel
  peerConnection.onconnectionstatechange = () => {
    debug('connectionState', peerConnection.connectionState)
    switch (peerConnection.connectionState) {
      case 'connecting':
        ui.button_connect.hidden = true
      break
      case 'connected':
        debugConnectionStats()
        ui.idContainer.hidden = true
        ui.button_connect.hidden = true
        ui.text_connection.className = 'online'
        ui.text_connection.textContent = 'Online'
      break
      case 'disconnected':
        ui.text_connection.className = 'reconnecting'
        ui.text_connection.textContent = 'Reconnecting'
      break
      case 'closed':
        resetConnection()
      break
    }
  }
}

function onDataChannel({channel} = {}) {
  if (channel.label == 'protocol1') {
    dataChannel = channel
    rpcBridge.onSend = data => {
      dataChannel.send(data)
    }
    dataChannel.onopen = () => {
      rpcBridge.isOpen = true
    }
    dataChannel.onmessage = ({data}) => {
      rpcBridge.handlePacket(data)
    }
    dataChannel.onerror = ({error}) => {
      // this will happen if other side e.g. refresh the tab
    }
    dataChannel.onclose = () => {
      resetConnection() // (since there is no reliable events to monitor when a peerConnection is closed we use a data channel to know when)
    }
  }
}

function debugConnectionStats() {
  peerConnection.getStats().then(reports => {
    for (const [id, report] of reports) {
      if (report.type == 'candidate-pair' && report.nominated) {
        const localCandidate = reports.get(report.localCandidateId)
        const remoteCandidate = reports.get(report.remoteCandidateId)
        const [local, remote] = [localCandidate.candidateType, remoteCandidate.candidateType]
        if (localCandidate.candidateType == 'relay' || remoteCandidate.candidateType == 'relay') {
          debug(`Relayed connection successful! (${local}, ${remote})`)
        } else {
          debug(`Direct connection successful! (${local}, ${remote})`)
        }
      }
    }
  })
}
