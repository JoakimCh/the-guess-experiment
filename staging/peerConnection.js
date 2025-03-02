
import {RTCPerfectNegotiator} from 'rtc-perfect-negotiator'
import {PeerServerSignalingClient, peerjsIceConfig, ensureClientReady} from 'tiny-peerserver-client'
import {e, debug, show, hide, disable, enable} from 'wrapped-elements'
// PeerServerSignalingClient.debug = debug

export let isDominant = true, myId, peerId
let rpcBridge
export function setRpcBridge(value) {
  rpcBridge = value
}
export const ui = {} // our private tags

/** @type {PeerServerSignalingClient} */
let signalingClient
/** @type {RTCPeerConnection} */
let peerConnection
/** @type {RTCDataChannel} */
let dataChannel

export const uiContainer = e.div.id('ui_peerConnection')(
  ui.idForm = e.form.onsubmit(()=>false).class('horizontal')(
    e.label('My ID:',
      e.input.type('text').name('myId').autocapitalize('none')
      .size(10).value(
        sessionStorage.getItem('myId') || localStorage.getItem('myId') || Math.random().toString(32).slice(2,7)
      )
      .on('keydown', 
        ({key}) => key == 'Enter' ? ui.idForm.peerId.focus() : null
      )()
    ),
    e.label('Peer ID:', 
      e.input.type('text').name('peerId').autocapitalize('none')
      .size(10).value(
        sessionStorage.getItem('peerId') || localStorage.getItem('peerId')
      )
      .on('keydown', 
        ({key}) => key == 'Enter' ? ui.button_ready.focus() : null
      )()
    ),
    e.label('Peer alias:', 
      e.input.type('text').name('alias').size(10)
      .on('keydown', 
        ({key}) => key == 'Enter' ? ui.button_ready.focus() : null
      )()
    )
  ),
  ui.buttonContainer = e.div.class('horizontal')(
    ui.text_connection = e.span.class('offline')('Offline'),
    ui.button_ready = e.button('Ready for peer connection'),
    ui.button_connect = e.button.hidden(true)('Try to connect'),
    ui.button_abort = e.button.hidden(true)('Abort peer connection'),
  )
)

ui.button_ready.onclick = () => {
  myId = ui.idForm.myId.value
  peerId = ui.idForm.peerId.value
  if (!myId || !peerId) {
    alert('Please fill out "my ID" and "peer ID"!')
    return
  }
  sessionStorage.setItem('myId', myId)
  sessionStorage.setItem('peerId', peerId)
  localStorage.setItem('myId', myId)
  localStorage.setItem('peerId', peerId)
  disable(ui.idForm)
  hide(ui.button_ready)
  show(ui.button_abort)
  initPeerConnection(myId, peerId, '-guessExp')
}

ui.button_abort.onclick = () => {
  if (confirm('Abort the connection?')) {
    resetConnection()
  }
}

ui.button_connect.onclick = () => {
  hide(ui.button_connect)
  const dataChannel = peerConnection.createDataChannel('protocol1')
  onDataChannel({channel: dataChannel})
}

function resetConnection() {
  rpcBridge.isOpen = false
  peerConnection?.close()
  signalingClient?.close()
  dataChannel = undefined
  ui.text_connection.className = 'offline'
  ui.text_connection.textContent = 'Offline'
  hide(ui.button_connect, ui.button_abort)
  show(ui.button_ready, ui.idForm)
  enable(ui.idForm)
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
  show(ui.button_connect)
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
        hide(ui.idForm, ui.button_connect)
      break
      case 'connected':
        debugConnectionStats()
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
    if (dataChannel) {
      debug('second data channel')
    }
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
